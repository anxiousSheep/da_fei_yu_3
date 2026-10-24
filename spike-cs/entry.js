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

// 投影单个 mesh 的几何 AABB 8 角（applyMatrixWorld）→ 最紧屏幕轮廓
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

// 诊断：读回画布实际非透明像素包围盒（物理 px → CSS px）
function actualBbox(){
  const c = document.createElement('canvas');
  c.width = renderer.domElement.width;
  c.height = renderer.domElement.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){
    if(data[(y*c.width+x)*4+3] > 8){ if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; }
  }
  if(mnx>mxx) return null;
  return { left:mnx/devicePixelRatio, top:mny/devicePixelRatio, right:mxx/devicePixelRatio, bottom:mxy/devicePixelRatio };
}

function loop(){ requestAnimationFrame(loop); group.rotation.y += 0.005; renderer.render(scene, camera); }
loop();

// 一次诊断：投影命中框 vs 实际像素包围盒
setTimeout(function(){
  const hr = hitRect();
  const ab = actualBbox();
  post({ type:'err', msg:'DIAG projected=' + JSON.stringify(hr) + ' actual=' + JSON.stringify(ab) });
}, 900);

// 持续上报命中框（给 clickCatcher 用）
setInterval(function(){ const r = hitRect(); post({ type:'hit', left:r.left, top:r.top, right:r.right, bottom:r.bottom, dpr:devicePixelRatio }); }, 300);
post({ type:'err', msg:'THREE-BUNDLE-RAN-OK' });
