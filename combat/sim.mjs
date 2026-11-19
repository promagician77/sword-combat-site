// Deterministic combat simulation, one call to step() per 60 Hz frame.
// The sword's hitbox is the animated blade itself, sampled several times
// between frames so a fast swing cannot pass through a target unseen.
import { ACTIONS, ENEMY_ACTIONS, BUFFER_FRAMES, HIT_SPACING, HIT_MAX_SAMPLES, BLEND, PLAYER, ENEMY, phase } from './actions.mjs';
import { animStart, animAdvance, animPose, blendPose, worldJoints, bladeSegment } from './anim.mjs';
import { segSegDist, rng, wrapAngle } from './geom.mjs';

const BUTTONS = ['light', 'heavy', 'dodge'];

function makeEntity(pos, yaw, clip) {
  return { pos: [...pos], yaw, state: 'idle', action: null, sf: 0, anim: animStart(null, clip, 0),
           hitSet: null, last: null, dir: [0, 0, 1] };
}

export function createSim({ seed = 7, substeps = 'auto', blends = true, enemyAI = true,
                            bufferFrames = BUFFER_FRAMES, playerPos = [0, 0, 0], enemyPos = [0, 0, 2.4] } = {}) {
  const sim = {
    f: 0, hitstop: 0, rand: rng(seed),
    opts: { substeps, blends, enemyAI, bufferFrames },
    player: makeEntity(playerPos, 0, 'idle'),
    enemy: makeEntity(enemyPos, Math.PI, 'idle'),
    buffer: [],
    stats: { hits: 0, combo: 0, bestCombo: 0, lastHit: -999, perfectDodges: 0, hitsTaken: 0, damage: 0 },
    events: [],
  };
  sim.enemy.poise = ENEMY.poise;
  sim.enemy.cooldown = 90;
  sim.enemy.lastHurt = -999;
  sim.enemy.perfectGiven = false;
  return sim;
}

const blendN = (sim, n) => (sim.opts.blends ? n : 0);
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const turnToward = (yaw, target, rate) => {
  const d = wrapAngle(target - yaw);
  return yaw + Math.max(-rate, Math.min(rate, d));
};
const ease = u => 1 - (1 - u) * (1 - u);
function lungeStep(l, sf) {
  if (!l || sf < l.from || sf >= l.to) return 0;
  const n = l.to - l.from;
  return l.dist * (ease((sf + 1 - l.from) / n) - ease((sf - l.from) / n));
}

export function poseOf(ent) { return animPose(ent.anim); }

function worldOf(ent, pose, isEnemy) {
  const cfg = isEnemy ? ENEMY : PLAYER;
  return worldJoints(pose, ent.pos, ent.yaw, cfg.size);
}

// Blade segments between last frame and this one. n is a fixed sample count,
// or 'auto': enough samples that the tip moves at most HIT_SPACING between
// them, so a fast frame gets more samples than a slow one.
export function sweptBlades(prev, cur, isEnemy, n) {
  const cfg = isEnemy ? ENEMY : PLAYER;
  const out = [];
  if (n === 'auto') {
    if (!prev) n = 1;
    else {
      const a = bladeSegment(worldJoints(prev.pose, prev.pos, prev.yaw, cfg.size), cfg.bladeLength);
      const b = bladeSegment(worldJoints(cur.pose, cur.pos, cur.yaw, cfg.size), cfg.bladeLength);
      const move = Math.max(Math.hypot(b[1][0] - a[1][0], b[1][1] - a[1][1], b[1][2] - a[1][2]),
                            Math.hypot(b[0][0] - a[0][0], b[0][1] - a[0][1], b[0][2] - a[0][2]));
      n = Math.min(HIT_MAX_SAMPLES, Math.max(1, Math.ceil(move / HIT_SPACING)));
    }
  }
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    let pose = cur.pose, pos = cur.pos, yaw = cur.yaw;
    if (prev && u < 1) {
      pose = blendPose(prev.pose, cur.pose, u);
      pos = [prev.pos[0] + (cur.pos[0] - prev.pos[0]) * u, 0, prev.pos[2] + (cur.pos[2] - prev.pos[2]) * u];
      yaw = prev.yaw + wrapAngle(cur.yaw - prev.yaw) * u;
    }
    out.push(bladeSegment(worldJoints(pose, pos, yaw, cfg.size), cfg.bladeLength));
  }
  return out;
}

export function bladeHits(segs, target, hurt) {
  const a = [target.pos[0], hurt.y0, target.pos[2]], b = [target.pos[0], hurt.y1, target.pos[2]];
  return segs.some(([h, t]) => segSegDist(h, t, a, b) <= hurt.r);
}

function start(sim, ent, name, table, isEnemy) {
  const a = table[name];
  ent.state = name; ent.action = a; ent.sf = 0; ent.hitSet = false;
  ent.anim = animStart(ent.anim, a.clip, blendN(sim, a.blendIn));
  if (isEnemy) ent.perfectGiven = false;
}

function toNeutral(sim, ent, isEnemy) {
  ent.state = 'idle'; ent.action = null; ent.sf = 0;
  ent.anim = animStart(ent.anim, 'idle', blendN(sim, BLEND.toIdle));
  if (isEnemy) ent.cooldown = 50 + Math.floor(sim.rand() * 60);
}

// Which buffered press can fire right now, newest first.
function legalTarget(p, b) {
  const a = p.action;
  if (!a) return { light: 'light1', heavy: 'heavy', dodge: 'dodge' }[b];
  if (a.kind === 'attack') {
    if (b === 'dodge') return p.sf >= a.dodgeFrom ? 'dodge' : null;
    if (a.cancel && p.sf >= a.cancel.from && p.sf < a.cancel.to) return a.cancel[b] ?? null;
    return null;
  }
  if (a.kind === 'dodge' && p.sf >= a.attackFrom) return { light: 'light1', heavy: 'heavy' }[b] ?? null;
  return null;
}

function updatePlayer(sim, input) {
  const p = sim.player, e = sim.enemy;
  if (p.action && p.sf >= p.action.total) toNeutral(sim, p, false);

  for (let i = sim.buffer.length - 1; i >= 0; i--) {
    const target = legalTarget(p, sim.buffer[i].b);
    if (!target) continue;
    const entry = sim.buffer[i];
    sim.buffer.splice(0, i + 1);
    const chained = p.action && p.action.kind === 'attack';
    sim.events.push({ f: sim.f, t: chained ? 'cancel' : 'start', from: p.state, to: target, age: entry.age });
    start(sim, p, target, ACTIONS, false);
    const m = input.move;
    const moving = Math.hypot(m[0], m[1]) > 0.2;
    if (target === 'dodge') {
      p.dir = moving ? [m[0], 0, m[1]] : [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
      const l = Math.hypot(p.dir[0], p.dir[2]); p.dir = [p.dir[0] / l, 0, p.dir[2] / l];
    } else if (moving) {
      p.yaw = Math.atan2(m[0], m[1]);
    } else {
      const d = Math.hypot(e.pos[0] - p.pos[0], e.pos[2] - p.pos[2]);
      const ang = Math.abs(wrapAngle(yawTo(p.pos, e.pos) - p.yaw));
      if (d < 3.6 && ang < 80 * Math.PI / 180) p.yaw = yawTo(p.pos, e.pos);   // soft lock
    }
    break;
  }

  const a = p.action, m = input.move;
  const moving = Math.hypot(m[0], m[1]) > 0.2;
  if (!a) {
    const want = moving ? 'run' : 'idle';
    if (want !== p.state) { p.state = want; p.anim = animStart(p.anim, want, blendN(sim, BLEND.idleRun)); }
    if (!moving) {
      // Standing near the sentinel: turn to face it, like a soft lock-on.
      const d = Math.hypot(e.pos[0] - p.pos[0], e.pos[2] - p.pos[2]);
      if (d < 4) p.yaw = turnToward(p.yaw, yawTo(p.pos, e.pos), 0.12);
    }
    if (moving) {
      const l = Math.min(1, Math.hypot(m[0], m[1]));
      p.yaw = turnToward(p.yaw, Math.atan2(m[0], m[1]), PLAYER.turnRate);
      p.pos[0] += m[0] / Math.hypot(m[0], m[1]) * l * PLAYER.runSpeed;
      p.pos[2] += m[1] / Math.hypot(m[0], m[1]) * l * PLAYER.runSpeed;
    }
  } else {
    if (a.kind === 'attack' && moving && p.sf < a.steer) p.yaw = turnToward(p.yaw, Math.atan2(m[0], m[1]), 0.12);
    const d = lungeStep(a.lunge, p.sf);
    const dir = a.kind === 'dodge' ? p.dir : [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
    p.pos[0] += dir[0] * d; p.pos[2] += dir[2] * d;
  }
}

function updateEnemy(sim) {
  const e = sim.enemy, p = sim.player;
  if (e.action && e.sf >= e.action.total) toNeutral(sim, e, true);
  if (sim.f - e.lastHurt > ENEMY.poiseRegen) e.poise = ENEMY.poise;
  const dist = Math.hypot(p.pos[0] - e.pos[0], p.pos[2] - e.pos[2]);
  if (!e.action) {
    if (!sim.opts.enemyAI) return;
    e.yaw = turnToward(e.yaw, yawTo(e.pos, p.pos), ENEMY.turnRate);
    if (e.cooldown > 0) e.cooldown--;
    const want = dist > ENEMY.keep + 0.4 ? 'walk' : 'idle';
    if (want !== e.state) {
      e.state = want;
      e.anim = animStart(e.anim, want === 'walk' ? 'run' : 'idle', blendN(sim, BLEND.idleRun), 0, want === 'walk' ? 0.55 : 1);
    }
    if (want === 'walk') {
      e.pos[0] += Math.sin(e.yaw) * ENEMY.walkSpeed; e.pos[2] += Math.cos(e.yaw) * ENEMY.walkSpeed;
    }
    if (e.cooldown === 0 && dist < ENEMY.engage) start(sim, e, 'slam', ENEMY_ACTIONS, true);
    return;
  }
  const a = e.action;
  if (a.kind === 'attack' && e.sf < a.track) e.yaw = turnToward(e.yaw, yawTo(e.pos, p.pos), 0.08);
  const d = lungeStep(a.lunge, e.sf);
  e.pos[0] += Math.sin(e.yaw) * d; e.pos[2] += Math.cos(e.yaw) * d;
}

function separate(sim) {
  const p = sim.player, e = sim.enemy;
  const dx = p.pos[0] - e.pos[0], dz = p.pos[2] - e.pos[2];
  const d = Math.hypot(dx, dz), min = PLAYER.radius + ENEMY.radius;
  if (d < min && d > 1e-9) { p.pos[0] = e.pos[0] + dx / d * min; p.pos[2] = e.pos[2] + dz / d * min; }
}

function resolveHits(sim, pCur, eCur) {
  const p = sim.player, e = sim.enemy, st = sim.stats;
  const n = sim.opts.substeps;
  if (p.action?.kind === 'attack' && phase(p.action, p.sf) === 'active' && !p.hitSet) {
    if (bladeHits(sweptBlades(p.last, pCur, false, n), e, ENEMY.hurt)) {
      p.hitSet = true;
      const a = p.action;
      sim.hitstop = a.hitstop;
      st.hits++; st.damage += a.damage;
      st.combo = sim.f - st.lastHit <= 90 ? st.combo + 1 : 1;
      st.bestCombo = Math.max(st.bestCombo, st.combo); st.lastHit = sim.f;
      e.poise -= a.poise; e.lastHurt = sim.f;
      const broke = e.poise <= 0;
      if (broke) { e.poise = ENEMY.poise; start(sim, e, 'stagger', ENEMY_ACTIONS, true); e.fresh = true; }
      sim.events.push({ f: sim.f, t: 'hit', action: p.state, sf: p.sf, stagger: broke });
    }
  }
  if (e.action?.kind === 'attack' && phase(e.action, e.sf) === 'active' && !e.hitSet) {
    if (bladeHits(sweptBlades(e.last, eCur, true, n), p, PLAYER.hurt)) {
      if (phase(p.action, p.sf) === 'invulnerable') {
        if (!e.perfectGiven) { e.perfectGiven = true; st.perfectDodges++; sim.events.push({ f: sim.f, t: 'perfect', psf: p.sf }); }
      } else {
        const was = { state: p.state, psf: p.sf };
        e.hitSet = true;
        sim.hitstop = Math.max(sim.hitstop, e.action.hitstop);
        st.hitsTaken++; st.combo = 0;
        start(sim, p, 'hitstun', ACTIONS, false); p.fresh = true;
        p.yaw = yawTo(p.pos, e.pos);
        sim.buffer.length = 0;
        sim.events.push({ f: sim.f, t: 'hurt', ...was });
      }
    }
  }
}

// Advance one 60 Hz frame. input = { move: [x, z], light, heavy, dodge }
// where the buttons are true on the frame they are pressed.
export function step(sim, input) {
  sim.f++;
  sim.events = [];
  sim.frozen = sim.hitstop > 0;
  if (sim.hitstop > 0) {
    for (const b of BUTTONS) if (input[b]) sim.buffer.push({ b, age: 0, at: sim.f });
    sim.hitstop--;
    return sim;
  }
  for (const it of sim.buffer) it.age++;
  sim.buffer = sim.buffer.filter(it => it.age <= sim.opts.bufferFrames);
  for (const b of BUTTONS) if (input[b]) sim.buffer.push({ b, age: 0, at: sim.f });

  updatePlayer(sim, input);
  updateEnemy(sim);
  separate(sim);

  const p = sim.player, e = sim.enemy;
  const pCur = { pose: poseOf(p), pos: [...p.pos], yaw: p.yaw };
  const eCur = { pose: poseOf(e), pos: [...e.pos], yaw: e.yaw };
  resolveHits(sim, pCur, eCur);

  for (const ent of [p, e]) {
    ent.last = ent === p ? pCur : eCur;
    ent.frame = { state: ent.state, action: ent.action, sf: ent.sf };   // what this frame showed
    // A reaction that began during hit resolution has not shown frame 0 yet.
    if (ent.fresh) { ent.fresh = false; continue; }
    animAdvance(ent.anim);
    if (ent.action) ent.sf++;
  }
  return sim;
}

// A compact, exact record of one frame, for traces and hashing.
export function snapshot(sim) {
  const p = sim.player, e = sim.enemy;
  return [sim.f, sim.hitstop, p.state, p.sf, p.pos[0], p.pos[2], p.yaw, e.state, e.sf, e.pos[0], e.pos[2], e.yaw,
          sim.stats.hits, sim.stats.hitsTaken, sim.stats.perfectDodges];
}

export function hashTrace(rows) {
  let h = 0x811c9dc5;
  for (const r of rows) {
    const s = r.join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}

// For tests and measurements: start an action directly.
export function forceAction(sim, who, name) {
  const ent = sim[who];
  start(sim, ent, name, who === 'enemy' ? ENEMY_ACTIONS : ACTIONS, who === 'enemy');
}
