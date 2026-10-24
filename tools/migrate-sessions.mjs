// 把指定工作区的会话从旧 cwd 迁移到新 cwd。
//
// DSH 把每个会话的项目目录（cwd）写在会话日志的第一帧（会话头）里，
// 工作区分组也按这个 cwd 计算；只改 workspace.json 会让会话变成「未分组」。
// 本脚本就地改写每个会话日志的第一帧，再把会话目录搬到新 cwd 对应的项目目录下。
//
// 用法：
//   node migrate-sessions.mjs --dry-run   # 只检查，不写盘
//   node migrate-sessions.mjs --apply     # 真正执行（必须先完全退出 DSH）
//
// 安全：改写前先写临时文件并回读校验，校验通过才替换原文件。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const OLD = String.raw`D:\DSH\DSH Workspace\2`
const NEW = String.raw`E:\Playground\BigFatFish3`

const apply = process.argv.includes('--apply')
const dryRun = !apply

// 可选：跳过指定会话（例如当前正在运行的会话，其日志仍被进程追加）
const excludeArg = process.argv.find((a) => a.startsWith('--exclude='))
const EXCLUDE = new Set(
  (excludeArg ? excludeArg.slice('--exclude='.length) : '').split(',').map((s) => s.trim()).filter(Boolean)
)

const DSH_HOME = path.join(os.homedir(), '.dsh')
const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions')
const PROJCACHE = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')

/** 复刻 DSH 的 projectKey 编码规则，保证目录名与运行期一致。 */
function projectKey(cwd) {
  let readable = ''
  let separatorRun = false
  for (const ch of cwd) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/** 解出第一帧（会话头）及其占用的字节数。 */
function decodeFirstFrame(buf) {
  return new Promise((resolve, reject) => {
    const dec = zlib.createZstdDecompress()
    const chunks = []
    dec.on('data', (c) => chunks.push(c))
    dec.on('error', reject)
    dec.on('end', () => {
      resolve({ text: Buffer.concat(chunks).toString('utf8'), consumed: dec.bytesWritten })
    })
    dec.end(buf)
  })
}

async function migrateOne(sessionDir, newRoot) {
  const file = path.join(sessionDir, 'session.v4.jsonl.zstd')
  if (!fs.existsSync(file)) return { ok: false, reason: '缺少 session.v4.jsonl.zstd' }

  const buf = fs.readFileSync(file)
  const { text, consumed } = await decodeFirstFrame(buf)
  const header = JSON.parse(text.split('\n')[0])

  if (header.cwd === NEW) return { ok: true, skipped: true, id: header.id }
  if (header.cwd !== OLD) return { ok: false, reason: `cwd 既不是旧值也不是新值：${header.cwd}` }

  header.cwd = NEW
  const frame = zlib.zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n'))
  const next = Buffer.concat([frame, buf.subarray(consumed)])

  const tmp = file + '.migrating'
  fs.writeFileSync(tmp, next)

  // 回读校验：新文件第一帧必须是新 cwd，且剩余字节未被改动
  const check = await decodeFirstFrame(fs.readFileSync(tmp))
  const checkHeader = JSON.parse(check.text.split('\n')[0])
  if (checkHeader.cwd !== NEW) throw new Error('回读校验失败：cwd 未写入')

  const restLen = fs.statSync(tmp).size - check.consumed
  if (restLen !== buf.length - consumed) throw new Error('回读校验失败：后续帧长度不一致')

  if (!dryRun) {
    fs.renameSync(tmp, file)
    fs.mkdirSync(newRoot, { recursive: true })
    fs.renameSync(sessionDir, path.join(newRoot, path.basename(sessionDir)))
  } else {
    fs.unlinkSync(tmp)
  }
  return { ok: true, id: header.id, bytes: buf.length }
}

function updateProjcache(sessionId) {
  const p = path.join(PROJCACHE, sessionId + '.json')
  if (!fs.existsSync(p)) return 'no-cache'
  const raw = fs.readFileSync(p, 'utf8')
  const j = JSON.parse(raw)
  const cur = j?.record?.identity?.cwd
  if (cur === undefined) return 'no-cwd'
  if (cur === NEW) return 'already'
  if (cur !== OLD) return `mismatch:${cur}`
  j.record.identity.cwd = NEW
  if (!dryRun) fs.writeFileSync(p, JSON.stringify(j, null, 2))
  return 'updated'
}

const oldRoot = path.join(SESSIONS_ROOT, projectKey(OLD))
const newRoot = path.join(SESSIONS_ROOT, projectKey(NEW))

console.log(`模式              : ${dryRun ? 'DRY-RUN（不写盘）' : 'APPLY'}`)
console.log(`旧 cwd            : ${OLD}`)
console.log(`新 cwd            : ${NEW}`)
console.log(`旧会话目录        : ${oldRoot}`)
console.log(`新会话目录        : ${newRoot}`)
console.log('')

if (!fs.existsSync(oldRoot)) {
  console.log('旧会话目录不存在——可能已迁移完成，无需操作。')
  process.exit(0)
}

const ids = fs.readdirSync(oldRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
if (ids.length === 0) {
  console.log('旧会话目录为空，无需操作。')
  process.exit(0)
}

let ok = 0
let failed = 0
for (const name of ids) {
  if (EXCLUDE.has(name)) {
    console.log(`  [SKIP] ${name}（按 --exclude 跳过）`)
    continue
  }
  const dir = path.join(oldRoot, name)
  try {
    const r = await migrateOne(dir, newRoot)
    if (r.ok) {
      ok++
      const cache = updateProjcache(name)
      console.log(`  [OK]   ${name}${r.skipped ? '（已迁移，跳过）' : ''}  cache=${cache}`)
    } else {
      failed++
      console.log(`  [FAIL] ${name}  ${r.reason}`)
    }
  } catch (e) {
    failed++
    console.log(`  [FAIL] ${name}  ${e.message}`)
  }
}

if (!dryRun) {
  try {
    if (fs.readdirSync(oldRoot).length === 0) fs.rmdirSync(oldRoot)
  } catch {}
}

console.log('')
console.log(`结果：成功 ${ok}，失败 ${failed}`)
if (failed > 0) {
  console.log('有失败项：常见原因是 DSH 未完全退出、会话文件被占用。请退出后重试。')
  process.exit(1)
}
if (dryRun) console.log('DRY-RUN 通过，确认无误后用 --apply 执行。')
