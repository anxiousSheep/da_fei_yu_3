import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// 点击穿透开关（托盘可切换）。开启：角色区可点、透明区穿透；关闭：整窗可交互。
let clickThroughEnabled = true

function applyClickThrough(ignore: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const effective = clickThroughEnabled ? ignore : false
  mainWindow.setIgnoreMouseEvents(effective, { forward: clickThroughEnabled })
}

function rebuildTrayMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏',
      click: (): void => {
        if (!mainWindow) return
        if (mainWindow.isVisible()) mainWindow.hide()
        else mainWindow.showInactive()
      }
    },
    {
      label: '点击穿透',
      type: 'checkbox',
      checked: clickThroughEnabled,
      click: (item): void => {
        clickThroughEnabled = item.checked
        applyClickThrough(true)
      }
    },
    { type: 'separator' },
    { label: '退出', click: (): void => app.quit() }
  ])
  tray?.setContextMenu(menu)
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Project Kujira 桌宠')
  rebuildTrayMenu()
  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else mainWindow?.showInactive()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.setAlwaysOnTop(true, 'normal')
  // 默认整窗穿透；渲染层射线命中角色后经 IPC 取消穿透。
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.showInactive() // 不抢焦点
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) mainWindow.showInactive()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.kujira.pet')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('set-click-through', (_event, ignore: boolean) => {
      applyClickThrough(ignore)
    })

    createWindow()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
