import * as THREE from './three.module.js';

function post(m){ try{ chrome.webview.postMessage(m); }catch(e){ console.error(e); } }

const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, preserveDrawingBuffer:true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3.4); camera.lookAt(0, 1.0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2,3,4); scene.add(key);

const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x4a90e2, roughness: 0.7 });
const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), mat); head.position.y = 1.55;
const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.42), mat); body.position.y = 0.75;
group.add(head, body); scene.add(group);

const _v = new THREE.Vector3();

function meshBBox(mesh){
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox;
  const cs = [[b.min.x,b.min.y,b.min.z],[b.max.x,b.min.y,b.min.z],[b.min.x,b.max.y,b.min.z],[b.max.x,b.max.y,b.min.z],
              [b.min.x,b.min.y,b.max.z],[b.max.x,b.min.y,b.max.z],[b.min.x,b.max.y,b.max.z],[b.max.x,b.max.y,b.max.z]];
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
  for(const c of cs){
    _v.set(c[0],c[1],c[2]).applyMatrix4(mesh.matrixWorld).project(camera);
    const sx=(_v.x*0.5+0.5)*innerWidth;
    const sy=(-_v.y*0.5+0.5)*innerHeight;
    if(sx<mnx)mnx=sx; if(sx>mxx)mxx=sx; if(sy<mny)mny=sy; if(sy>mxy)mxy=sy;
  }
  return { mnx, mny, mxx, mxy };
}
function hitRect(){
  const a = meshBBox(body), h = meshBBox(head);
  const left = Math.min(a.mnx, h.mnx), top = Math.min(a.mny, h.mny);
  const right = Math.max(a.mxx, h.mxx), bottom = Math.max(a.mxy, h.mxy);
  return { left:Math.floor(left), top:Math.floor(top), right:Math.ceil(right), bottom:Math.ceil(bottom) };
}

function toBase64(bytes){
  let s = '';
  for(let i=0;i<bytes.length;i+=8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i+8192));
  return btoa(s);
}

const MASK_SCALE = 2; // 每采样覆盖的物理像素
function reportMask(){
  const hr = hitRect();
  const dpr = devicePixelRatio;
  const c = document.createElement('canvas');
  c.width = renderer.domElement.width;
  c.height = renderer.domElement.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;

  const bx = Math.floor(hr.left * dpr), by = Math.floor(hr.top * dpr);
  const bw = Math.ceil((hr.right - hr.left) * dpr), bh = Math.ceil((hr.bottom - hr.top) * dpr);
  const mw = Math.max(1, Math.ceil(bw / MASK_SCALE)), mh = Math.max(1, Math.ceil(bh / MASK_SCALE));
  const mask = new Uint8Array(mw * mh);
  for(let my=0; my<mh; my++){
    for(let mx=0; mx<mw; mx++){
      let a = 0;
      for(let sy=0; sy<MASK_SCALE; sy++){
        const py = by + my*MASK_SCALE + sy; if(py >= c.height) break;
        for(let sx=0; sx<MASK_SCALE; sx++){
          const px = bx + mx*MASK_SCALE + sx; if(px >= c.width) break;
          const v = data[(py*c.width + px)*4 + 3];
          if(v > a) a = v;
        }
      }
      mask[my*mw + mx] = a > 8 ? 255 : 0;
    }
  }
  post({ type:'mask', mask: toBase64(mask), mw: mw, mh: mh, x: hr.left, y: hr.top, w: hr.right - hr.left, h: hr.bottom - hr.top });
}

function loop(){ requestAnimationFrame(loop); group.rotation.y += 0.005; renderer.render(scene, camera); }
loop();
setInterval(reportMask, 200);
post({ type:'err', msg:'MASK-MODE-RAN-OK' });
