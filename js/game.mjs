// The playable arena: renders the simulation, feeds it timestamped input,
// and draws the HUD and frame meter.
import * as THREE from '../vendor/three.module.js';
import { createSim, sweptBlades } from '../combat/sim.mjs';
import { Driver } from '../combat/driver.mjs';
import { ENEMY, PLAYER, phase } from '../combat/actions.mjs';
import { blendPose, worldJoints, bladeSegment } from '../combat/anim.mjs';
import { wrapAngle } from '../combat/geom.mjs';
import { makeMannequin, applyWorld } from './mannequin.mjs';

const stage = document.getElementById('arena');
const canvas = stage.querySelector('canvas');
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = new URLSearchParams(location.search);
const CAPTURE = Q.get('capture');            // 'heavy', 'light1' or 'perfect': freeze on that moment
let vclock = 0, frozenAt = null;

// ---- Scene -------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x232838);
scene.fog = new THREE.Fog(0x232838, 13, 30);
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);

scene.add(new THREE.HemisphereLight(0xBFCBE8, 0x3A3026, 1.15));
const key = new THREE.DirectionalLight(0xFFE3C2, 2.4);
key.position.set(-5, 10, -3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x8FB4FF, 1.1);
rim.position.set(3, 4, 9);
scene.add(rim);

function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7A766E'; g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 100 + Math.floor(r() * 12);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(15, 15); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
const ring = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.32, 96),
  new THREE.MeshBasicMaterial({ color: 0xC9A15A, transparent: true, opacity: 0.55 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
scene.add(ring);

const hero = makeMannequin();
const foe = makeMannequin({ body: 0x7A2F2F, joint: 0x221B1B, blade: 0x9AA2AB, size: ENEMY.size, bladeLength: ENEMY.bladeLength });
scene.add(hero.root, foe.root);

// ---- Trail, sparks, hitbox view ----------------------------------------------
function makeTrail(color) {
  const MAX = 48;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX * 2), 1));
  const idx = [];
  for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) } },
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * vA, vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, geo, MAX, samples: [] };
}
const trails = { player: makeTrail(0xFFD98A), enemy: makeTrail(0xFF7A55) };
function updateTrail(t, seg, now, live) {
  if (live) t.samples.push({ seg, now });
  t.samples = t.samples.filter(s => now - s.now < 90).slice(-t.MAX);
  const pos = t.geo.attributes.position.array, al = t.geo.attributes.alpha.array;
  pos.fill(0); al.fill(0);
  const n = t.samples.length;
  t.samples.forEach((s, i) => {
    const k = i * 2, f = (1 - (now - s.now) / 90) * (0.35 + 0.65 * (i + 1) / n);
    // From a third of the way up the blade to the tip.
    const h = s.seg[0].map((v, j) => v + (s.seg[1][j] - v) * 0.3);
    pos.set(h, k * 3); pos.set(s.seg[1], k * 3 + 3);
    al[k] = f * 0.15; al[k + 1] = f * 0.9;
  });
  t.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  t.geo.attributes.position.needsUpdate = true; t.geo.attributes.alpha.needsUpdate = true;
}

const SPARKS = 120;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false }));
sparkPts.frustumCulled = false;
scene.add(sparkPts);
let sparks = [];
function burst(at, color, n = 22, speed = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * 1.2 - 0.3;
    const v = speed * (0.4 + Math.random() * 0.8);
    sparks.push({ p: [...at], v: [Math.cos(a) * Math.cos(b) * v, Math.sin(b) * v + 1.5, Math.sin(a) * Math.cos(b) * v],
                  life: 0.28 + Math.random() * 0.18, age: 0, c: color });
  }
  sparks = sparks.slice(-SPARKS);
}
function updateSparks(dt) {
  const pos = sparkGeo.attributes.position.array, col = sparkGeo.attributes.color.array;
  pos.fill(0); col.fill(0);
  sparks = sparks.filter(s => (s.age += dt) < s.life);
  sparks.forEach((s, i) => {
    s.v[1] -= 9 * dt;
    for (let j = 0; j < 3; j++) s.p[j] += s.v[j] * dt;
    const f = 1 - s.age / s.life;
    pos.set(s.p, i * 3); col.set([s.c[0] * f, s.c[1] * f, s.c[2] * f], i * 3);
  });
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
}

const hitboxView = new THREE.Group(); hitboxView.visible = false; scene.add(hitboxView);
const wire = c => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.6 });
const hurtP = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER.hurt.r, PLAYER.hurt.y1 - PLAYER.hurt.y0, 4, 12), wire(0x7FD1FF));
const hurtE = new THREE.Mesh(new THREE.CapsuleGeometry(ENEMY.hurt.r, ENEMY.hurt.y1 - ENEMY.hurt.y0, 4, 12), wire(0xFF9A7F));
const bladeLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xFFE066 }));
bladeLines.frustumCulled = false;
hitboxView.add(hurtP, hurtE, bladeLines);

// ---- Simulation, input, HUD --------------------------------------------------
const KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
               KeyD: 'right', ArrowRight: 'right', KeyJ: 'light', KeyK: 'heavy', Space: 'dodge', KeyL: 'dodge' };
const NAMES = { idle: 'Ready', run: 'Moving', light1: 'Light 1', light2: 'Light 2', light3: 'Light 3, finisher',
                heavy: 'Heavy', dodge: 'Dodge', hitstun: 'Hit' };
const FOE_NAMES = { idle: 'watching', walk: 'closing in', slam: 'slam', stagger: 'staggered' };
const PHASE_WORD = { startup: 'startup', active: 'active', recovery: 'recovery', invulnerable: 'invulnerable',
                     dodge: 'vulnerable', hitstun: 'hit reaction' };
const METER = 90;
const CAM_HEADING = 38 * Math.PI / 180;   // camera looks along +z turned 38 degrees toward +x
let sim, driver, prev, cur, meter, botOn = false, shake = 0, flash = 0, lastNow = 0;
let slow = false, toast = null;
const meterRows = { player: $('meter-you'), enemy: $('meter-foe') };
for (const row of Object.values(meterRows)) for (let i = 0; i < METER; i++) row.appendChild(document.createElement('i'));

function reset() {
  sim = createSim({ seed: CAPTURE ? Number(Q.get('seed') ?? 11) : (Math.random() * 1e9) | 0 });
  driver = new Driver(sim, { onStep });
  driver.mapMove = ([x, z]) => [x * Math.cos(CAM_HEADING) + z * Math.sin(CAM_HEADING),
                                -x * Math.sin(CAM_HEADING) + z * Math.cos(CAM_HEADING)];
  driver.bot = botOn ? bot : null;
  driver.setScale(slow ? 0.25 : 1, performance.now());
  prev = cur = null;
  meter = { player: Array(METER).fill(''), enemy: Array(METER).fill('') };
  renderMeter();
}

function frameClass(ent) {
  if (sim.frozen) return 'hs';
  const f = ent.frame;
  if (!f || !f.action) return '';
  return { startup: 'su', active: 'ac', recovery: 're', invulnerable: 'iv', dodge: 'dv', hitstun: 'ht' }[phase(f.action, f.sf)] ?? '';
}
function renderMeter() {
  for (const who of ['player', 'enemy']) {
    const cells = meterRows[who].children;
    for (let i = 0; i < METER; i++) cells[i].className = meter[who][i];
  }
}

function onStep(s) {
  const p = s.player, e = s.enemy;
  if (p.last) { prev = cur ?? { player: p.last, enemy: e.last }; cur = { player: p.last, enemy: e.last }; }
  for (const [who, ent] of [['player', p], ['enemy', e]]) { meter[who].shift(); meter[who].push(frameClass(ent)); }
  for (const ev of s.events) {
    if (ev.t === 'hit') {
      const at = [e.pos[0] + (p.pos[0] - e.pos[0]) * 0.3, 1.25, e.pos[2] + (p.pos[2] - e.pos[2]) * 0.3];
      burst(at, [1, 0.85, 0.45], ev.action === 'heavy' || ev.action === 'light3' ? 34 : 20);
      shake = ev.action === 'heavy' ? 0.16 : ev.action === 'light3' ? 0.12 : 0.06;
      flash = 1;
      if (ev.stagger) showToast('Poise broken');
    }
    if (ev.t === 'perfect') { showToast('Perfect dodge'); burst([p.pos[0], 1.0, p.pos[2]], [0.6, 0.7, 1], 16, 3); }
    if (ev.t === 'hurt') { shake = 0.14; stage.classList.remove('hurt'); void stage.offsetWidth; stage.classList.add('hurt'); }
  }
}

function showToast(text) {
  const el = $('hud-toast');
  el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toast); toast = setTimeout(() => el.classList.remove('show'), 900);
}

function updateHud() {
  const p = sim.player, e = sim.enemy;
  const f = p.frame;
  $('hud-action').textContent = NAMES[p.state] ?? p.state;
  if (f && f.action) {
    const ph = sim.frozen ? 'hit-stop' : PHASE_WORD[phase(f.action, f.sf)];
    $('hud-frame').textContent = `Frame ${f.sf + 1} of ${f.action.total}, ${ph}`;
  } else $('hud-frame').textContent = ' ';
  $('hud-foe').textContent = `Sentinel: ${FOE_NAMES[e.state] ?? e.state}`;
  const st = sim.stats;
  $('hud-combo').textContent = st.combo;
  $('hud-hits').textContent = st.hits;
  $('hud-perfect').textContent = st.perfectDodges;
  $('hud-taken').textContent = st.hitsTaken;
  $('hud-buffer').textContent = sim.buffer.length
    ? 'Buffered: ' + sim.buffer.map(b => `${b.b} (${b.age} ${b.age === 1 ? 'frame' : 'frames'} old)`).join(', ')
    : ' ';
}

// ---- Demo player -------------------------------------------------------------
const PATTERNS = [['light', 'light', 'light'], ['light', 'light', 'heavy'], ['light'], ['heavy']];
let plan = [], pi = 0, wait = 20;
function bot(s) {
  const p = s.player, e = s.enemy;
  const dx = e.pos[0] - p.pos[0], dz = e.pos[2] - p.pos[2], d = Math.hypot(dx, dz) || 1;
  const out = { move: [0, 0], light: false, heavy: false, dodge: false };
  if (e.state === 'slam') {
    // Dodge into the slam so it passes through the invulnerable frames.
    if (e.sf >= 22 && e.sf <= 24 && d < 3.4 && p.state !== 'dodge' && p.state !== 'hitstun') {
      out.move = [dx / d, dz / d]; out.dodge = true; plan = []; return out;
    }
    // Punish the long recovery.
    if (e.sf >= 38 && e.sf < 44 && !p.action) { out.heavy = true; wait = 30; return out; }
    if (!p.action) return out;                     // watch the wind-up
  }
  if (!p.action && d > 2.0) { out.move = [dx / d, dz / d]; return out; }
  if (!p.action && !plan.length && --wait <= 0) plan = [...PATTERNS[pi++ % PATTERNS.length]];
  const ready = !p.action || (p.action.kind === 'attack' && p.sf === 7);
  if (plan.length && ready) { out[plan.shift()] = true; if (!plan.length) wait = 40; }
  return out;
}

// ---- Input --------------------------------------------------------------------
const held = new Set();
function stopBot() { if (botOn) toggleBot(false); }
stage.addEventListener('keydown', ev => {
  const k = KEYS[ev.code];
  if (!k) return;
  ev.preventDefault();
  if (ev.repeat) return;
  stopBot();
  held.add(k);
  driver.push({ type: 'down', key: k, time: ev.timeStamp });
});
stage.addEventListener('keyup', ev => {
  const k = KEYS[ev.code];
  if (!k) return;
  held.delete(k);
  driver.push({ type: 'up', key: k, time: ev.timeStamp });
});
stage.addEventListener('blur', () => {
  for (const k of held) driver.push({ type: 'up', key: k, time: performance.now() });
  held.clear();
});
canvas.addEventListener('pointerdown', () => stage.focus());
for (const b of document.querySelectorAll('[data-key]')) {
  const k = b.dataset.key;
  const down = ev => { ev.preventDefault(); stopBot(); driver.push({ type: 'down', key: k, time: ev.timeStamp }); };
  const up = ev => driver.push({ type: 'up', key: k, time: ev.timeStamp });
  b.addEventListener('pointerdown', down);
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, up);
}

function toggleBot(on = !botOn) {
  botOn = on; driver.bot = on ? bot : null; plan = []; wait = 20;
  $('btn-demo').setAttribute('aria-pressed', on);
  $('btn-demo').textContent = on ? 'Stop the demo' : 'Watch the demo';
}
$('btn-demo').addEventListener('click', () => toggleBot());
$('btn-slow').addEventListener('click', () => {
  slow = !slow; driver.setScale(slow ? 0.25 : 1, performance.now());
  $('btn-slow').setAttribute('aria-pressed', slow);
});
$('btn-boxes').addEventListener('click', () => {
  hitboxView.visible = !hitboxView.visible;
  $('btn-boxes').setAttribute('aria-pressed', hitboxView.visible);
});
$('btn-reset').addEventListener('click', () => { reset(); stage.focus(); });

// ---- Frame loop ----------------------------------------------------------------
const camPos = new THREE.Vector3(-3.1, 2.9, -2.8), camLook = new THREE.Vector3(0, 1.05, 1.2);
function lerpSnap(a, b, t, isEnemy) {
  const pose = blendPose(a.pose, b.pose, t);
  const pos = [a.pos[0] + (b.pos[0] - a.pos[0]) * t, 0, a.pos[2] + (b.pos[2] - a.pos[2]) * t];
  const yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * t;
  return { pose, pos, yaw, world: worldJoints(pose, pos, yaw, isEnemy ? ENEMY.size : PLAYER.size) };
}
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);

function captureDone(s) {
  const f = s.player.frame;
  if (CAPTURE === 'perfect') return s.events.some(e => e.t === 'perfect');
  if (!f || s.f < 240) return false;
  return f.state === CAPTURE && f.sf === { heavy: 20, light1: 9, light3: 12 }[CAPTURE];
}
function frame(now) {
  requestAnimationFrame(frame);
  if (CAPTURE) {
    if (frozenAt !== null) return;
    vclock += 1000 / 120; now = vclock;
  }
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  if (!visible) { driver.advance(now); return; }
  const w = stage.clientWidth, h = stage.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  let alpha = driver.advance(now);
  if (CAPTURE && captureDone(sim)) { frozenAt = sim.f; alpha = 1; document.documentElement.dataset.captured = String(sim.f); }
  if (cur) {
    const P = lerpSnap(prev.player, cur.player, alpha, false), E = lerpSnap(prev.enemy, cur.enemy, alpha, true);
    applyWorld(hero, P.world); applyWorld(foe, E.world);
    for (const [who, S, ent, len] of [['player', P, sim.player, PLAYER.bladeLength], ['enemy', E, sim.enemy, ENEMY.bladeLength]]) {
      const f = ent.frame, a = f?.action;
      const live = a?.kind === 'attack' && f.sf >= a.startup - 1 && f.sf < a.startup + a.active + 3;
      updateTrail(trails[who], bladeSegment(S.world, len), now, live);
    }
    foe.bodyMat.emissive.setRGB(flash * 0.42, flash * 0.12, flash * 0.06);   // brighter red, never near-white
    flash = Math.max(0, flash - dt * 7);
    // Camera: a fixed three-quarter view from the sword-arm side, framing both fighters.
    const mid = new THREE.Vector3((P.pos[0] + E.pos[0]) / 2, 0, (P.pos[2] + E.pos[2]) / 2);
    const span = Math.hypot(P.pos[0] - E.pos[0], P.pos[2] - E.pos[2]);
    const dist = 5.0 + Math.max(0, span - 2.2) * 0.8;
    const fwd = new THREE.Vector3(Math.sin(CAM_HEADING), 0, Math.cos(CAM_HEADING));
    camPos.lerp(mid.clone().addScaledVector(fwd, -dist).setY(2.55 + dist * 0.08), 1 - Math.pow(0.002, dt));
    camLook.lerp(new THREE.Vector3(mid.x, 1.05, mid.z), 1 - Math.pow(0.001, dt));
    camera.position.copy(camPos);
    if (shake > 0 && !reduceMotion) {
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
    }
    shake = Math.max(0, shake - dt * 0.9);
    camera.lookAt(camLook);
    key.target.position.copy(mid); key.position.set(mid.x - 5, 10, mid.z - 3);
    if (hitboxView.visible) {
      hurtP.position.set(P.pos[0], (PLAYER.hurt.y0 + PLAYER.hurt.y1) / 2, P.pos[2]);
      hurtE.position.set(E.pos[0], (ENEMY.hurt.y0 + ENEMY.hurt.y1) / 2, E.pos[2]);
      const pts = [];
      for (const [who, isE] of [['player', false], ['enemy', true]]) {
        const ent = sim[who], f = ent.frame;
        if (f?.action?.kind === 'attack' && phase(f.action, f.sf) === 'active') {
          for (const [hh, t] of sweptBlades(prev[who], cur[who], isE, 'auto')) pts.push(...hh, ...t);
        }
      }
      bladeLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    }
  }
  updateSparks(dt);
  renderer.render(scene, camera);
  renderMeter();
  updateHud();
}

reset();
if (!reduceMotion || CAPTURE) toggleBot(true);
requestAnimationFrame(frame);
document.documentElement.dataset.arena = 'ready';
