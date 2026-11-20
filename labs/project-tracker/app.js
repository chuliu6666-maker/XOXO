import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js?v=1.8.2';
import { projects } from './projects.js?v=1.8.2';
import { ConveyorMotion, stadium, clamp } from './motion.js?v=1.8.2';
import { viewSettings, frontRowPhase, loadPosterTextures, HoverDriveMotion } from './view.js?v=1.8.2';

const stage = document.querySelector('#stage');
const resourceUrl = path => `${path}${path.includes('?') ? '&' : '?'}v=1.8.2`;
const bootStarted = performance.now();
let sceneReady = false;
stage.dataset.sceneReady = 'false';
stage.dataset.version = '1.8.2';
stage.dataset.expectedTextures = String(projects.length);
stage.dataset.frontPosters = projects.slice(0,4).map(project => project.id).join(',');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch { document.querySelector('#loading').setAttribute('aria-label','当前浏览器无法启动 WebGL 2，请启用硬件加速后刷新。'); throw new Error('WebGL 2 unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
const nightColor = '#080a0e';
scene.background = new THREE.Color(nightColor);
scene.fog = new THREE.FogExp2(nightColor, .026);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = true;
controls.cursor.set(0,1.95,0); controls.maxTargetRadius=1.6;
controls.minPolarAngle = .28;
controls.maxPolarAngle = Math.PI/2+.1;
controls.rotateSpeed = .55;
controls.zoomSpeed = .55;
controls.autoRotate = false; // Pointer drag owns the camera; hover drives the chain.
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
// A single overhead softbox: one reflection panel represents the same spotlight.
const env = new THREE.Scene();
env.background = new THREE.Color('#07090d');
function softbox(position, size, color, intensity) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
  panel.position.set(...position); panel.lookAt(0,3,0); env.add(panel);
}
softbox([-4,10,7], [5,5], '#f5f5f2', 5);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTarget = pmrem.fromScene(env, 0.04);
scene.environment = envTarget.texture;
env.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); }); pmrem.dispose();

const key = new THREE.SpotLight(0xf5f5f2,900,40,.95,.7,2);
key.position.set(-4, 10, 7); key.target.position.set(0,2.3,0); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: .5, far: 40 });
key.shadow.bias = -0.0005; key.shadow.normalBias = 0.025;
key.shadow.radius = 4;
scene.add(key,key.target);

// Fine deterministic brushed grain breaks the perfectly smooth CGI surface.
const grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 256;
const grainContext = grainCanvas.getContext('2d'); const grainImage = grainContext.createImageData(256,256);
let seed = 84;
for (let y=0;y<256;y++) for (let x=0;x<256;x++) {
  seed = (Math.imul(seed,1664525)+1013904223)>>>0;
  const value = 190 + ((seed>>>24)/255-.5)*25 + Math.sin(y*1.6)*9;
  const i=(y*256+x)*4; grainImage.data.set([value,value,value,255],i);
}
grainContext.putImageData(grainImage,0,0);
const grain = new THREE.CanvasTexture(grainCanvas); grain.wrapS=grain.wrapT=THREE.RepeatWrapping; grain.repeat.set(2,8);
const metal = new THREE.MeshPhysicalMaterial({ color: '#b9bdc3', metalness: 1, roughness: .34, roughnessMap: grain, bumpMap: grain, bumpScale: .0012, envMapIntensity: 1.15, clearcoat: .12, clearcoatRoughness: .3 });
const brightMetal = new THREE.MeshPhysicalMaterial({ color: '#cdd0d5', metalness: 1, roughness: .25, roughnessMap: grain, envMapIntensity: 1.2, clearcoat: .18 });
const darkMetal = new THREE.MeshStandardMaterial({ color: '#565b63', metalness: .96, roughness: .42, roughnessMap: grain });
const rubber = new THREE.MeshStandardMaterial({ color: '#17191d', roughness: .8 });
const blue = new THREE.MeshStandardMaterial({ color: '#959ba4', metalness: .93, roughness: .27 });
const structure = new THREE.Group(); scene.add(structure);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);

function rod(parent, from, to, radius = 0.035, mat = metal) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
  const mesh = new THREE.Mesh(unitCylinder, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, delta.clone().normalize());
  mesh.scale.set(radius, delta.length(), radius);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function box(parent, position, size, mat = metal) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.position.set(...position); mesh.scale.set(...size);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function tube(parent, points, radius = 0.015, mat = brightMetal, smooth = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  if (!smooth) { const group = new THREE.Group(); for (let i = 1; i < points.length; i++) rod(group, points[i-1], points[i], radius, mat); parent.add(group); return group; }
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, radius, 12, false), mat);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}

// Procedural scaffold: no downloaded GLB, textures, or author-owned model required.
const railHeight = 3.65;
for (const x of [-2.55, 2.55]) for (const z of [-1.05, 1.05]) {
  rod(structure, [x, railHeight+.02, z], [x, 9, z], 0.058);
  for (let y = railHeight+.45; y < 9; y += .75) {
    rod(structure, [x, y-.045, z], [x, y+.045, z], .087, darkMetal);
    box(structure, [x+.075, y, z], [.085, .045, .14], brightMetal);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.021,.021,.04,6),brightMetal);
    bolt.rotation.z=Math.PI/2; bolt.position.set(x+.125,y,z); structure.add(bolt);
  }
  rod(structure, [x, railHeight+.02, z], [x*.64, 5.2, z], .034);
}
for (const y of [5.2, 7.65]) {
  for (const z of [-1.05, 1.05]) {
    rod(structure, [-2.55, y, z], [2.55, y, z], .048);
    rod(structure, [-2.55, y, z], [2.55, y+2.45, z], .034);
    rod(structure, [2.55, y, z], [-2.55, y+2.45, z], .034);
  }
  for (const x of [-2.55, 2.55]) rod(structure, [x, y, -1.05], [x, y, 1.05], .038);
}
for (const x of [-2.55, 0, 2.55]) {
  rod(structure, [x, railHeight, -1.55], [x, railHeight, 1.55], .048);
  for (const z of [-1.55, 1.55]) box(structure, [x, railHeight+.03, z], [.28, .16, .25], darkMetal);
}

class RailCurve extends THREE.Curve {
  constructor(radius = 1.55, y = railHeight) { super(); this.radius = radius; this.y = y; }
  getPoint(t, target = new THREE.Vector3()) { const p = stadium(t, 2.55, this.radius); return target.set(p.x, this.y, p.z); }
}
for (const offset of [-.11, .11]) for (const y of [railHeight, railHeight-.22]) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new RailCurve(1.55+offset, y), 240, .042, 10, true), metal);
  mesh.castShadow = true; mesh.receiveShadow = true; structure.add(mesh);
}
for (let i = 0; i < 90; i++) {
  const p = stadium(i/90);
  const r = box(structure, [p.x, railHeight-.11, p.z], [.035, .21, .19], brightMetal);
  r.rotation.y = Math.atan2(-p.tz, p.tx);
}

const tileCanvas = document.createElement('canvas'); tileCanvas.width=tileCanvas.height=1024;
const tileContext = tileCanvas.getContext('2d');
for (let row=0;row<2;row++) for (let col=0;col<2;col++) {
  tileContext.fillStyle = (row+col)%2 ? '#20242b' : '#11151b'; tileContext.fillRect(col*512,row*512,512,512);
  tileContext.strokeStyle='#3b424d'; tileContext.lineWidth=2; tileContext.strokeRect(col*512+1,row*512+1,510,510);
}
const tiles = new THREE.CanvasTexture(tileCanvas); tiles.colorSpace=THREE.SRGBColorSpace;
tiles.wrapS=tiles.wrapT=THREE.RepeatWrapping; tiles.repeat.set(65,65); tiles.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: tiles, color: '#9ba6b7', roughness: .43, metalness: .28, envMapIntensity: .4 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.025; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(70, 70, 0x99a6c5, 0x747e97);
grid.position.y = .002; grid.material.transparent = true; grid.material.opacity = .08; grid.visible = false; scene.add(grid);

const posterLoader = new THREE.TextureLoader();
const posterTextures = new Map();
async function loadCardTexture(card) {
  const { project, paper, back } = card;
  const texture = await posterLoader.loadAsync(resourceUrl(project.preview));
  if (texture.image.decode) await texture.image.decode();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Upload before revealing the sheet: an onload event alone does not guarantee
  // that the first rendered frame already has its texture in GPU memory.
  renderer.initTexture(texture);
  for (const side of [paper,back]) {
    side.material.map = texture;
    side.material.color.set('#ffffff');
    side.material.needsUpdate = true;
  }
  posterTextures.set(project.id, texture);
  stage.dataset.texturesReady = String(posterTextures.size);
  stage.dataset.printedSidesReady = String(posterTextures.size*2);
}

function posterFrame(parent) {
  const w=.69, top=-.67, bottom=-2.71, r=.075;
  const path = new THREE.CurvePath();
  const v=(x,y)=>new THREE.Vector3(x,y,.004);
  const line=(a,b)=>path.add(new THREE.LineCurve3(v(...a),v(...b)));
  const corner=(a,b,c)=>path.add(new THREE.QuadraticBezierCurve3(v(...a),v(...b),v(...c)));
  line([-w+r,top],[w-r,top]); corner([w-r,top],[w,top],[w,top-r]);
  line([w,top-r],[w,bottom+r]); corner([w,bottom+r],[w,bottom],[w-r,bottom]);
  line([w-r,bottom],[-w+r,bottom]); corner([-w+r,bottom],[-w,bottom],[-w,bottom+r]);
  line([-w,bottom+r],[-w,top-r]); corner([-w,top-r],[-w,top],[-w+r,top]);
  const frame = new THREE.Mesh(new THREE.TubeGeometry(path,92,.027,12,true),metal);
  frame.castShadow=true; frame.receiveShadow=true; parent.add(frame);
  for (const y of [top-.2,bottom+.2]) for (const x of [-w,w]) rod(parent,[x,y-.025,.004],[x,y+.025,.004],.035,brightMetal);
  const ringGeometry = new THREE.TorusGeometry(.013,.004,6,12);
  for (const x of [-.52,-.26,0,.26,.52]) for (const y of [-.785,-2.585]) {
    const ring=new THREE.Mesh(ringGeometry,brightMetal); ring.position.set(x,y,.018); parent.add(ring);
    const frameY = y > -1 ? top : bottom;
    tube(parent,[[x,y,.022],[x,frameY,.032],[x,frameY,-.028],[x,y,-.014]],.004,rubber,true);
  }
  for (const x of [-.596,.596]) for (const y of [-1.14,-1.68,-2.22]) {
    const ring=new THREE.Mesh(ringGeometry,brightMetal); ring.position.set(x,y,.018); parent.add(ring);
    const frameX=x>0?w:-w;
    tube(parent,[[x,y,.02],[frameX,y,.034],[frameX,y,-.028],[x,y,-.012]],.004,rubber,true);
  }
}

const motion = new ConveyorMotion(projects.length);
const initialPhase = frontRowPhase(projects.length);
motion.phase = initialPhase;
const drive = new HoverDriveMotion();
let hoverEnabled=true;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
function updateReduced() { motion.reduced = reducedQuery.matches; if (motion.reduced) { motion.auto = false; updatePlay(); } }
reducedQuery.addEventListener('change', updateReduced);
const cards = [], pickables = [];
projects.forEach((project, index) => {
  const carrier = new THREE.Group(); scene.add(carrier);
  box(carrier, [0,.055,0], [.25,.18,.31], rubber);
  for (const z of [-.18,.18]) for (const x of [-.07,.07]) {
    const wheel = rod(carrier, [x,.09,z-.035], [x,.09,z+.035], .073, blue); wheel.castShadow = false;
  }
  rod(carrier, [0,-.1,0], [0,-.24,0], .025);
  const swing = new THREE.Group(); swing.position.y = -.23; carrier.add(swing);
  const hook = [];
  for (let j = 0; j <= 22; j++) { const a = -.25 + j/22 * Math.PI*1.72; hook.push([Math.cos(a)*.105, -.15+Math.sin(a)*.105, 0]); }
  hook.push([-.045,-.36,0]); tube(swing, hook, .014, brightMetal, true);
  tube(swing, [[-.045,-.36,0],[-.5,-.67,0]], .018);
  tube(swing, [[-.045,-.36,0],[.5,-.67,0]], .018);
  const ratio = project.width / project.height;
  const paperWidth = Math.min(1.23, 1.85 * ratio);
  const paperHeight = paperWidth / ratio;
  const frameGroup = new THREE.Group();
  const frameScaleY = (paperHeight + .19) / 2.04;
  frameGroup.scale.set((paperWidth + .15) / 1.38, frameScaleY, 1);
  frameGroup.position.y = -.67 * (1 - frameScaleY);
  swing.add(frameGroup);
  posterFrame(frameGroup);
  const geometry = new THREE.PlaneGeometry(paperWidth, paperHeight, 10, 16);
  const base = geometry.attributes.position.array.slice();
  // Artwork colors bypass studio lighting, exposure, fog and material tint.
  // Materials remain neutral during hidden preparation. The full scene only
  // becomes visible once all 13 maps have finished loading and GPU upload.
  const paper = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#6d7681', toneMapped: false, fog: false, side: THREE.FrontSide }));
  paper.position.y = -.765 - paperHeight / 2; paper.castShadow = true; paper.receiveShadow = true;
  paper.userData.project = project; swing.add(paper); pickables.push(paper);
  // The reverse is a second front-facing printed sheet, rotated physically:
  // its UVs remain readable instead of mirroring a DoubleSide material.
  const back = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#6d7681', toneMapped: false, fog: false, side: THREE.FrontSide }));
  back.position.copy(paper.position); back.position.z = -.009;
  back.rotation.y = Math.PI;
  back.castShadow = true; swing.add(back);
  back.userData.project=project; pickables.push(back);
  cards.push({ carrier, swing, paper, back, geometry, base, index, project });
});

let previousView = null;
function resize(resetView = false) {
  const previousDistance=camera.position.distanceTo(controls.target);
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix();
  scene.fog.density = w/h<.85 ? .011 : .026;
  const view=viewSettings(w/h);
  controls.minDistance=view.minDistance; controls.maxDistance=view.maxDistance;
  if (resetView) {
    drive.reset();
    // Drain old orbit/pan inertia before placing the home camera.
    controls.autoRotate=false; controls.enableDamping=false; controls.update(0); controls.enableDamping=true;
    controls.target.set(0,view.targetY,0);
    camera.position.set(Math.sin(view.azimuth)*Math.cos(view.elevation),Math.sin(view.elevation),Math.cos(view.azimuth)*Math.cos(view.elevation)).multiplyScalar(view.distance).add(controls.target);
  } else if (previousView) {
    // Resize the existing camera offset before OrbitControls clamps its old
    // distance to the new limits. Crossing portrait/landscape restores the
    // four-poster fit; other changes retain the visitor's relative zoom.
    const crossedLayout=previousView.portrait!==view.portrait;
    const relativeZoom=crossedLayout ? 1 : previousDistance/previousView.distance;
    const nextDistance=clamp(view.distance*relativeZoom,view.minDistance,view.maxDistance);
    camera.position.sub(controls.target).normalize().multiplyScalar(nextDistance).add(controls.target);
  }
  previousView=view;
  controls.update();
}
window.addEventListener('resize', () => resize()); resize(true);

function updatePlay() {
  const button = document.querySelector('#play');
  if(!button) return;
  button.textContent = hoverEnabled ? '暂停旋转' : '恢复旋转'; button.setAttribute('aria-pressed', String(!hoverEnabled));
}
updateReduced();
document.querySelector('#play')?.addEventListener('click', () => { hoverEnabled = !hoverEnabled; updatePlay(); });
document.querySelector('#previous')?.addEventListener('click', () => motion.nudge(-1/projects.length));
document.querySelector('#next')?.addEventListener('click', () => motion.nudge(1/projects.length));
document.querySelector('#reset')?.addEventListener('click', () => { motion.reset(); motion.phase=initialPhase; hoverEnabled=true; updatePlay(); resize(true); });
const homeLink=document.querySelector('.home-link');
if(homeLink && !location.pathname.includes('/labs/project-tracker')) homeLink.hidden=true;
let wireframe = false;
const wireMaterial = new THREE.MeshBasicMaterial({ color: '#e8ecff', wireframe: true });
structure.traverse(obj => { if (obj.isMesh) obj.userData.solidMaterial = obj.material; });
document.querySelector('#wireframe')?.addEventListener('click', event => {
  wireframe = !wireframe;
  structure.traverse(obj => { if (obj.isMesh) obj.material = wireframe ? wireMaterial : obj.userData.solidMaterial; });
  grid.visible = wireframe;
  event.currentTarget.setAttribute('aria-pressed', String(wireframe));
});

const dialog = document.querySelector('#details');
function openProject(project) {
  drive.reset();
  motion.blocked = true; motion.hovered = false; motion.velocity = 0; motion.impulse = 0; motion.drive = 0; updatePlay();
  const image=document.querySelector('#detail-image');
  image.src=resourceUrl(project.image); image.alt=project.title+' · 放大作品';
  document.querySelector('#detail-caption').textContent = project.title;
  dialog.setAttribute('aria-label',project.title+' · 图片放大');
  dialog.showModal();
}
document.querySelector('#close-detail').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
dialog.addEventListener('close', () => { motion.blocked=false; motion.hovered=false; stage.focus({ preventScroll: true }); });

const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
function hitAt(event) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX-r.left)/r.width*2-1, -(event.clientY-r.top)/r.height*2+1);
  ray.setFromCamera(pointer,camera); return ray.intersectObjects(pickables)[0];
}
let drag = null;
const activePointers = new Set();
const canvas = renderer.domElement;
let hoverPointer=null, hoverArmed=false, viewInteracting=false;
const finePointer = matchMedia('(hover: hover)');
function trackPointer(event) {
  if(!sceneReady) return;
  if(event.pointerType!=='mouse') { hoverPointer=null; return; }
  if(event.type==='pointermove' && (event.movementX || event.movementY)) hoverArmed=true;
  if(!hoverArmed) return;
  const r=canvas.getBoundingClientRect();
  hoverPointer={x:(event.clientX-r.left)/r.width*2-1,y:-(event.clientY-r.top)/r.height*2+1};
}
function hoveredPoster() {
  if(!sceneReady || !hoverArmed || !hoverPointer || !finePointer.matches || !canvas.matches(':hover')) return null;
  pointer.set(hoverPointer.x,hoverPointer.y); ray.setFromCamera(pointer,camera);
  // Only the nearest printed sheet triggers acceleration. Gaps and steel stay idle.
  return ray.intersectObjects(pickables)[0]?.object.userData.project || null;
}
controls.addEventListener('start',()=>{ viewInteracting=true; });
controls.addEventListener('end',()=>{ viewInteracting=false; });
function pointerInside(event) {
  const r=canvas.getBoundingClientRect();
  return event.clientX>=r.left && event.clientX<=r.right && event.clientY>=r.top && event.clientY<=r.bottom;
}
canvas.addEventListener('pointerenter', () => { hoverPointer=null; hoverArmed=false; });
canvas.addEventListener('pointerleave', () => { hoverPointer=null; hoverArmed=false; motion.hovered=false; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if(!sceneReady) return;
  trackPointer(event);
  activePointers.add(event.pointerId);
  if (activePointers.size > 1) { drag = null; motion.dragging = false; return; }
  if (dialog.open) return;
  stage.focus({ preventScroll: true });
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), total: 0, card: event.button===0 ? hitAt(event)?.object.userData.project : null };
  motion.impulse=0;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  trackPointer(event);
  if (!drag || drag.id !== event.pointerId || activePointers.size > 1) return;
  const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
  drag.total += Math.abs(dx) + Math.abs(dy);
  drag.x = event.clientX; drag.y = event.clientY;
  if (drag.total >= 7) {
    // OrbitControls rotates the camera. A drag must never advance the conveyor.
    motion.dragging=true;
    drag.card=null;
  }
});
function endPointer(event, cancelled = false) {
  activePointers.delete(event.pointerId);
  if (!drag || drag.id !== event.pointerId) return;
  motion.dragging = false;
  motion.hovered=!cancelled && event.pointerType==='mouse' && pointerInside(event);
  if (!cancelled && drag.total < 7 && drag.card) openProject(drag.card);
  drag = null;
}
canvas.addEventListener('pointerup', event => endPointer(event));
canvas.addEventListener('pointercancel', event => endPointer(event, true));
canvas.addEventListener('lostpointercapture', event => endPointer(event, true));
const keys = new Set();
stage.addEventListener('keydown', event => {
  if (!sceneReady || dialog.open || !['ArrowLeft','ArrowRight',' '].includes(event.key)) return;
  event.preventDefault(); keys.add(event.key);
  if (event.key === ' ' && !event.repeat) { hoverEnabled = !hoverEnabled; updatePlay(); }
  motion.drive = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
});
window.addEventListener('keyup', event => { keys.delete(event.key); motion.drive = Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')); });
function clearInput() { keys.clear(); activePointers.clear(); drag = null; motion.drive = 0; motion.dragging = false; motion.hovered=false; hoverPointer=null; hoverArmed=false; viewInteracting=false; drive.reset(); }
window.addEventListener('blur', clearInput);
stage.addEventListener('focusout', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); lastTime = performance.now(); });

let lastTime = performance.now(), frame = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) { lastTime = now; return; }
  const dt = Math.min((now-lastTime)/1000, .08); lastTime = now;
  const hoverProject = !dialog.open && hoverEnabled ? hoveredPoster() : null;
  motion.hovered=Boolean(hoverProject);
  const driveStep=drive.tick(dt,{active:motion.hovered,reduced:motion.reduced,interacting:motion.dragging || (viewInteracting && activePointers.size>1),blocked:motion.blocked});
  // Automatic movement belongs to the chain. Camera orbit is manual in the video.
  motion.orbitMode=true;
  const transportSpeed=drive.speed/(Math.PI*2);
  motion.tick(dt,{transportSpeed});
  motion.phase=(motion.phase+driveStep/(Math.PI*2))%1;
  controls.target.y=clamp(controls.target.y,1.25,3.5);
  const distance=camera.position.distanceTo(controls.target);
  controls.maxPolarAngle=Math.min(Math.PI/2+.1,Math.acos(clamp((.8-controls.target.y)/distance,-1,1)));
  controls.update(dt);
  cards.forEach(({ carrier, swing, geometry, base, index }) => {
    const p = stadium(index/projects.length + motion.phase);
    carrier.position.set(p.x, railHeight-.05, p.z);
    carrier.rotation.y = Math.atan2(-p.tz,p.tx);
    const angle = motion.swings[index].angle;
    swing.rotation.z = angle;
    const movement=clamp(Math.abs(transportSpeed+motion.velocity)*24,0,1);
    swing.rotation.x = motion.reduced ? 0 : Math.sin(now*.0016+index*.9)*.01*movement - movement*.075*Math.abs(p.tz);
    // Flexible lower edge lags behind the hanger; top edge stays pinned.
    if (frame % 2 === 0) {
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = base[i*3], y = base[i*3+1], bottom = (geometry.parameters.height / 2 - y) / geometry.parameters.height;
        position.setZ(i, Math.sin(x*2.4)*.012 + (motion.reduced ? 0 : Math.sin(now*.003+index+x*2)*Math.abs(angle)*.06*bottom*bottom));
      }
      position.needsUpdate = true;
      // Very small bow uses the plane normals to avoid recomputing 12 meshes every frame.
    }
  });
  const state = motion.blocked ? '查看作品' : motion.dragging ? '空间拖拽' : motion.hovered ? '海报加速' : drive.speed>.0003 ? '逐步放缓' : hoverEnabled ? '悬停海报旋转' : '已暂停';
  const status = document.querySelector('#counter');
  const label = `${projects.length} PROJECTS / ${state}`;
  if(status && status.textContent!==label) status.textContent=label;
  stage.dataset.viewDistance=camera.position.distanceTo(controls.target).toFixed(3);
  stage.dataset.minDistance=controls.minDistance.toFixed(3); stage.dataset.maxDistance=controls.maxDistance.toFixed(3);
  stage.dataset.viewAngle=`${controls.getAzimuthalAngle().toFixed(3)},${controls.getPolarAngle().toFixed(3)}`;
  stage.dataset.driveSpeed=drive.speed.toFixed(5);
  stage.dataset.hoveringPoster=hoverProject?.id || '';
  stage.dataset.conveyorPhase=motion.phase.toFixed(5);
  stage.dataset.maxPosterLean=Math.max(...motion.swings.map(s=>Math.abs(s.angle))).toFixed(5);
  renderer.render(scene,camera); frame++;
}
requestAnimationFrame(animate);

async function preparePosters() {
  try {
    // The front four have priority, but no gray rear sheet is revealed: all 13
    // small previews must finish decoding and GPU upload before scene reveal.
    // Full-sized originals are decoded only when a visitor opens the dialog.
    await loadPosterTextures(cards,loadCardTexture,()=>{
      stage.dataset.frontReadyMs=(performance.now()-bootStarted).toFixed(1);
    });
    stage.dataset.allReadyMs=(performance.now()-bootStarted).toFixed(1);
    // Wait through an actual rendered frame, including shader compilation and
    // texture upload, before removing the visible four-image loading preview.
    requestAnimationFrame(() => {
      renderer.render(scene,camera);
      requestAnimationFrame(() => {
        clearInput(); sceneReady=true;
        stage.dataset.sceneReady='true';
        stage.dataset.sceneReadyMs=(performance.now()-bootStarted).toFixed(1);
        stage.classList.add('scene-ready');
        document.querySelector('#loading').hidden=true;
        document.querySelector('#loading-preview').setAttribute('aria-hidden','true');
      });
    });
  } catch(error) {
    // Keep the non-black HTML artwork preview visible if WebGL texture setup
    // fails; never reveal an empty or black set of front-facing cards.
    stage.dataset.previewError='poster-textures';
    document.querySelector('#loading').setAttribute('aria-label','图片载入失败，请刷新');
    console.error('Poster previews failed:',error);
  }
}
preparePosters();
