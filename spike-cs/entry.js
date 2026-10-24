import * as THREE from './three.module.js';

function post(m){ try{ chrome.webview.postMessage(m); }catch(e){ console.error(e); } }

const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
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
const corners = [[-0.31,-0.4,-0.21],[0.31,-0.4,-0.21],[-0.31,0.4,-0.21],[0.31,0.4,-0.21],[-0.31,-0.4,0.21],[0.31,-0.4,0.21],[-0.31,0.4,0.21],[0.31,0.4,0.21]];
function hitRect(){
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
  for(const c of corners){ _v.set(c[0],c[1],c[2]).applyMatrix4(group.matrixWorld).project(camera); const sx=(_v.x*0.5+0.5)*innerWidth; const sy=(-_v.y*0.5+0.5)*innerHeight; if(sx<mnx)mnx=sx; if(sx>mxx)mxx=sx; if(sy<mny)mny=sy; if(sy>mxy)mxy=sy; }
  return { left:Math.floor(mnx), top:Math.floor(mny), right:Math.ceil(mxx), bottom:Math.ceil(mxy) };
}
function report(){ const r=hitRect(); post({ type:'hit', left:r.left, top:r.top, right:r.right, bottom:r.bottom, dpr:devicePixelRatio }); }
function loop(){ requestAnimationFrame(loop); group.rotation.y += 0.005; renderer.render(scene, camera); }
loop(); report(); setInterval(report, 300);
post({ type:'err', msg:'THREE-BUNDLE-RAN-OK' });
