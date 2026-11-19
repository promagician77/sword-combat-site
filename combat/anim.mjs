// Skeleton, hand-keyed clips and the pose maths used by both the simulation
// (the sword's hitbox follows the animated blade) and the renderer.
import { qEuler, qMul, qRot, qSlerp, qIdent, qAxis, add, lerp3 } from './geom.mjs';

// Joints in parent-before-child order. Offsets are in the parent's frame, in
// metres; at rest every joint hangs straight down its parent's -y.
export const JOINTS = [
  ['hips', null, [0, 0.94, 0]],
  ['spine', 'hips', [0, 0.10, 0]],
  ['chest', 'spine', [0, 0.24, 0]],
  ['neck', 'chest', [0, 0.25, 0]],
  ['head', 'neck', [0, 0.10, 0]],
  ['upperArmR', 'chest', [-0.20, 0.19, 0]],
  ['foreArmR', 'upperArmR', [0, -0.29, 0]],
  ['handR', 'foreArmR', [0, -0.26, 0]],
  ['upperArmL', 'chest', [0.20, 0.19, 0]],
  ['foreArmL', 'upperArmL', [0, -0.29, 0]],
  ['handL', 'foreArmL', [0, -0.26, 0]],
  ['thighR', 'hips', [-0.10, -0.04, 0]],
  ['shinR', 'thighR', [0, -0.43, 0]],
  ['footR', 'shinR', [0, -0.43, 0]],
  ['thighL', 'hips', [0.10, -0.04, 0]],
  ['shinL', 'thighL', [0, -0.43, 0]],
  ['footL', 'shinL', [0, -0.43, 0]],
].map(([name, parent, offset]) => ({ name, parent, offset }));
export const JOINT_NAMES = JOINTS.map(j => j.name);

// The blade lies along the sword hand's local +z.
export const BLADE = { hilt: 0.05, length: 1.0 };

// Poses are Euler degrees per joint (yaw, then pitch, then roll in the
// parent frame; see geom.qEuler) plus a root offset that lowers or raises
// the hips. A key only lists the joints that differ from the guard.
const GUARD = {
  root: [0, -0.06, 0],
  hips: [0, 0, 0], spine: [6, 0, 0], chest: [4, -12, 0], neck: [0, 6, 0], head: [-6, 6, 0],
  upperArmR: [-38, 14, -8], foreArmR: [-62, 0, 0], handR: [62, 0, 0],
  upperArmL: [-22, -12, 14], foreArmL: [-58, 0, 0], handL: [10, 0, 0],
  thighR: [-22, 0, 0], shinR: [26, 0, 0], footR: [-4, 0, 0],
  thighL: [14, 0, 0], shinL: [22, 0, 0], footL: [-36, 0, 0],
};

const pose = (over = {}) => ({ ...GUARD, ...over });

// Clip keys: [frame, pose, ease into this key].
export const CLIPS = {
  idle: { frames: 120, loop: true, keys: [
    [0, pose()],
    [60, pose({ root: [0, -0.072, 0], chest: [6, -12, 0], upperArmR: [-36, 14, -8], head: [-4, 6, 0] }), 'inout'],
    [120, pose(), 'inout'],
  ] },
  run: { frames: 36, loop: true, keys: [
    [0, pose({ root: [0, -0.07, 0], spine: [16, 0, 0], thighR: [-42, 0, 0], shinR: [20, 0, 0], footR: [-10, 0, 0],
               thighL: [34, 0, 0], shinL: [70, 0, 0], footL: [-20, 0, 0], upperArmL: [30, -10, 14], foreArmL: [-50, 0, 0],
               upperArmR: [-46, 14, -8] })],
    [9, pose({ root: [0, -0.02, 0], spine: [16, 0, 0], thighR: [-4, 0, 0], shinR: [60, 0, 0], thighL: [-6, 0, 0], shinL: [24, 0, 0],
               footL: [-18, 0, 0], upperArmL: [0, -10, 14], foreArmL: [-55, 0, 0], upperArmR: [-40, 14, -8] }), 'inout'],
    [18, pose({ root: [0, -0.07, 0], spine: [16, 0, 0], thighL: [-42, 0, 0], shinL: [20, 0, 0], footL: [-10, 0, 0],
                thighR: [34, 0, 0], shinR: [70, 0, 0], footR: [-20, 0, 0], upperArmL: [-40, -10, 14], foreArmL: [-60, 0, 0],
                upperArmR: [-34, 14, -8] }), 'inout'],
    [27, pose({ root: [0, -0.02, 0], spine: [16, 0, 0], thighL: [-4, 0, 0], shinL: [60, 0, 0], thighR: [-6, 0, 0], shinR: [24, 0, 0],
                footR: [-18, 0, 0], upperArmL: [0, -10, 14], foreArmL: [-55, 0, 0], upperArmR: [-40, 14, -8] }), 'inout'],
    [36, null, 'inout'],
  ] },

  // Horizontal cut, right to left. Startup 0-6 winds the blade back to the
  // right; active 7-10 sweeps it across the front; recovery settles and
  // returns to guard.
  light1: { frames: 27, keys: [
    [0, pose()],
    [6, pose({ root: [0, -0.10, 0], spine: [4, -10, 0], chest: [2, -48, 0], head: [-4, 40, 0],
               upperArmR: [-78, -68, -10], foreArmR: [-24, 0, 0], handR: [88, 0, -20],
               upperArmL: [-40, 10, 20], thighR: [-14, 0, 0], thighL: [18, 0, 0]
             }), 'inout'],
    [8, pose({ root: [0, -0.11, 0], spine: [8, 0, 0], chest: [6, -6, 0], head: [-6, 4, 0],
               upperArmR: [-86, 4, -6], foreArmR: [-6, 0, 0], handR: [86, 0, -10],
               upperArmL: [-30, -10, 24] }), 'linear'],
    [10, pose({ root: [0, -0.12, 0], spine: [10, 8, 0], chest: [8, 40, 0], head: [-6, -32, 0],
                upperArmR: [-84, 62, -2], foreArmR: [-10, 0, 0], handR: [80, 0, 0],
                upperArmL: [-12, -30, 30], thighR: [-30, 0, 0], shinR: [34, 0, 0], thighL: [20, 0, 0] })],
    [16, pose({ root: [0, -0.11, 0], spine: [12, 10, 0], chest: [8, 48, 0], head: [-6, -38, 0],
                upperArmR: [-70, 74, 4], foreArmR: [-16, 0, 0], handR: [92, 0, 10],
                upperArmL: [-6, -34, 30], thighR: [-30, 0, 0], shinR: [34, 0, 0], thighL: [20, 0, 0] }), 'out'],
    [26, pose(), 'inout'],
  ] },

  // Rising backhand, low left to high right.
  light2: { frames: 28, keys: [
    [0, pose({ root: [0, -0.11, 0], chest: [8, 44, 0], head: [-6, -34, 0], upperArmR: [-72, 70, 0], foreArmR: [-14, 0, 0], handR: [90, 0, 8] })],
    [5, pose({ root: [0, -0.15, 0], spine: [14, 10, 0], chest: [12, 52, 0], head: [-8, -40, 0],
               upperArmR: [-46, 66, 20], foreArmR: [-20, 0, 0], handR: [92, 0, 40],
               upperArmL: [-10, -30, 30], thighR: [-28, 0, 0], shinR: [40, 0, 0] }), 'inout'],
    [7, pose({ root: [0, -0.10, 0], spine: [6, 0, 0], chest: [2, 4, 0], head: [-4, 0, 0],
               upperArmR: [-112, 6, 4], foreArmR: [-8, 0, 0], handR: [66, 0, 20] }), 'linear'],
    [9, pose({ root: [0, -0.05, 0], spine: [-2, -10, 0], chest: [-6, -40, 0], head: [-8, 30, 0],
               upperArmR: [-150, -52, -10], foreArmR: [-6, 0, 0], handR: [40, 0, 10],
               upperArmL: [-36, 20, 26], thighR: [-16, 0, 0], thighL: [18, 0, 0] })],
    [15, pose({ root: [0, -0.06, 0], spine: [0, -10, 0], chest: [-4, -46, 0], head: [-6, 36, 0],
                upperArmR: [-146, -62, -14], foreArmR: [-12, 0, 0], handR: [36, 0, 10],
                upperArmL: [-40, 22, 26] }), 'out'],
    [27, pose(), 'inout'],
  ] },

  // Overhead finisher: raise high, drive straight down, settle low.
  light3: { frames: 41, keys: [
    [0, pose({ root: [0, -0.06, 0], chest: [-4, -40, 0], upperArmR: [-146, -50, -10], foreArmR: [-10, 0, 0], handR: [40, 0, 10] })],
    [9, pose({ root: [0, -0.01, 0], spine: [-8, 0, 0], chest: [-14, -8, 0], head: [-14, 4, 0],
               upperArmR: [-172, 10, 0], foreArmR: [-34, 0, 0], handR: [24, 0, 0],
               upperArmL: [-150, -10, -10], foreArmL: [-40, 0, 0],
               thighR: [-18, 0, 0], shinR: [14, 0, 0], thighL: [10, 0, 0], shinL: [12, 0, 0] }), 'inout'],
    [11, pose({ root: [0, -0.06, 0], spine: [6, 0, 0], chest: [4, -6, 0],
                upperArmR: [-128, 10, 0], foreArmR: [-14, 0, 0], handR: [40, 0, 0],
                upperArmL: [-100, -10, -10], foreArmL: [-20, 0, 0] }), 'linear'],
    [14, pose({ root: [0, -0.22, 0], spine: [22, 0, 0], chest: [14, -4, 0], head: [-20, 0, 0],
                upperArmR: [-58, 10, 0], foreArmR: [-8, 0, 0], handR: [65, 0, 0],
                upperArmL: [-30, -20, 20], foreArmL: [-40, 0, 0],
                thighR: [-50, 0, 0], shinR: [64, 0, 0], footR: [-14, 0, 0], thighL: [26, 0, 0], shinL: [50, 0, 0], footL: [-60, 0, 0] })],
    [22, pose({ root: [0, -0.21, 0], spine: [20, 0, 0], chest: [12, -4, 0], head: [-18, 0, 0],
                upperArmR: [-56, 10, 0], foreArmR: [-10, 0, 0], handR: [66, 0, 0],
                upperArmL: [-26, -20, 20], foreArmL: [-40, 0, 0],
                thighR: [-50, 0, 0], shinR: [64, 0, 0], footR: [-14, 0, 0], thighL: [26, 0, 0], shinL: [50, 0, 0], footL: [-60, 0, 0] }), 'out'],
    [40, pose(), 'inout'],
  ] },

  // Heavy: a long wind-up behind the right shoulder, then a diagonal cleave
  // down to the left with a big step.
  heavy: { frames: 51, keys: [
    [0, pose()],
    [10, pose({ root: [0, -0.10, 0], spine: [-4, -16, 0], chest: [-10, -46, 0], head: [-6, 40, 0],
                upperArmR: [-150, -60, -20], foreArmR: [-50, 0, 0], handR: [30, 0, -10],
                upperArmL: [-60, 20, 20], thighR: [-10, 0, 0], thighL: [22, 0, 0], shinL: [30, 0, 0] }), 'out'],
    [17, pose({ root: [0, -0.12, 0], spine: [-6, -20, 0], chest: [-12, -54, 0], head: [-6, 46, 0],
                upperArmR: [-160, -66, -24], foreArmR: [-56, 0, 0], handR: [26, 0, -14],
                upperArmL: [-64, 24, 20], thighR: [-8, 0, 0], thighL: [24, 0, 0], shinL: [32, 0, 0] }), 'inout'],
    [19, pose({ root: [0, -0.16, 0], spine: [10, 0, 0], chest: [6, -6, 0], head: [-10, 4, 0],
                upperArmR: [-120, -4, -6], foreArmR: [-14, 0, 0], handR: [54, 0, -10],
                upperArmL: [-30, -6, 24] }), 'linear'],
    [22, pose({ root: [0, -0.26, 0], spine: [24, 14, 0], chest: [14, 46, 0], head: [-20, -36, 0],
                upperArmR: [-46, 58, 10], foreArmR: [-6, 0, 0], handR: [104, 0, 20],
                upperArmL: [-6, -40, 34], thighR: [-56, 0, 0], shinR: [70, 0, 0], footR: [-14, 0, 0],
                thighL: [30, 0, 0], shinL: [56, 0, 0], footL: [-66, 0, 0] })],
    [32, pose({ root: [0, -0.25, 0], spine: [22, 14, 0], chest: [12, 48, 0], head: [-18, -38, 0],
                upperArmR: [-42, 60, 12], foreArmR: [-8, 0, 0], handR: [104, 0, 22],
                upperArmL: [-4, -40, 34], thighR: [-56, 0, 0], shinR: [70, 0, 0], footR: [-14, 0, 0],
                thighL: [30, 0, 0], shinL: [56, 0, 0], footL: [-66, 0, 0] }), 'out'],
    [50, pose(), 'inout'],
  ] },

  // Low quick-step. Invulnerable frames are set in actions.mjs, not here.
  dodge: { frames: 24, keys: [
    [0, pose()],
    [4, pose({ root: [0, -0.30, 0], spine: [34, 0, 0], chest: [16, 0, 0], head: [-34, 0, 0],
               upperArmR: [10, 10, -10], foreArmR: [-40, 0, 0], handR: [70, 0, 0],
               upperArmL: [30, -10, 20], foreArmL: [-30, 0, 0],
               thighR: [-60, 0, 0], shinR: [80, 0, 0], footR: [-20, 0, 0], thighL: [40, 0, 0], shinL: [70, 0, 0], footL: [-60, 0, 0] }), 'out'],
    [14, pose({ root: [0, -0.26, 0], spine: [28, 0, 0], chest: [12, 0, 0], head: [-28, 0, 0],
                upperArmR: [0, 10, -10], foreArmR: [-44, 0, 0], handR: [70, 0, 0],
                upperArmL: [20, -10, 20], foreArmL: [-34, 0, 0],
                thighR: [-50, 0, 0], shinR: [74, 0, 0], footR: [-24, 0, 0], thighL: [30, 0, 0], shinL: [60, 0, 0], footL: [-52, 0, 0] }), 'inout'],
    [23, pose(), 'inout'],
  ] },

  hitstun: { frames: 22, keys: [
    [0, pose()],
    [3, pose({ root: [0, -0.04, 0], spine: [-14, 0, 0], chest: [-18, 10, 0], head: [-26, -10, 0],
               upperArmR: [-20, -40, -30], foreArmR: [-30, 0, 0], handR: [80, 0, 0],
               upperArmL: [-10, 20, 40], foreArmL: [-20, 0, 0], thighR: [-6, 0, 0], thighL: [20, 0, 0] }), 'out'],
    [10, pose({ root: [0, -0.10, 0], spine: [10, 0, 0], chest: [6, 6, 0], head: [-4, -6, 0],
                upperArmR: [-24, -10, -14], foreArmR: [-50, 0, 0], handR: [70, 0, 0] }), 'inout'],
    [21, pose(), 'inout'],
  ] },

  // The training sentinel's slam: a slow, readable wind-up, a fast drop.
  slam: { frames: 71, keys: [
    [0, pose()],
    [26, pose({ root: [0, 0.0, 0], spine: [-12, 0, 0], chest: [-16, -6, 0], head: [-16, 4, 0],
                upperArmR: [-176, 6, 0], foreArmR: [-40, 0, 0], handR: [20, 0, 0],
                upperArmL: [-166, -6, 0], foreArmL: [-40, 0, 0],
                thighR: [-16, 0, 0], shinR: [12, 0, 0], thighL: [10, 0, 0], shinL: [12, 0, 0] }), 'inout'],
    [31, pose({ root: [0, 0.01, 0], spine: [-14, 0, 0], chest: [-18, -6, 0], head: [-18, 4, 0],
                upperArmR: [-178, 6, 0], foreArmR: [-46, 0, 0], handR: [18, 0, 0],
                upperArmL: [-168, -6, 0], foreArmL: [-46, 0, 0],
                thighR: [-16, 0, 0], shinR: [12, 0, 0], thighL: [10, 0, 0], shinL: [12, 0, 0] }), 'inout'],
    [34, pose({ root: [0, -0.10, 0], spine: [10, 0, 0], chest: [4, -4, 0],
                upperArmR: [-110, 6, 0], foreArmR: [-10, 0, 0], handR: [50, 0, 0],
                upperArmL: [-100, -6, 0], foreArmL: [-14, 0, 0] }), 'linear'],
    [36, pose({ root: [0, -0.24, 0], spine: [24, 0, 0], chest: [14, -4, 0], head: [-22, 0, 0],
                upperArmR: [-54, 6, 0], foreArmR: [-6, 0, 0], handR: [57, 0, 0],
                upperArmL: [-46, -6, 0], foreArmL: [-10, 0, 0],
                thighR: [-50, 0, 0], shinR: [64, 0, 0], footR: [-14, 0, 0], thighL: [26, 0, 0], shinL: [50, 0, 0], footL: [-60, 0, 0] })],
    [52, pose({ root: [0, -0.23, 0], spine: [22, 0, 0], chest: [12, -4, 0], head: [-20, 0, 0],
                upperArmR: [-52, 6, 0], foreArmR: [-8, 0, 0], handR: [60, 0, 0],
                upperArmL: [-44, -6, 0], foreArmL: [-12, 0, 0],
                thighR: [-50, 0, 0], shinR: [64, 0, 0], footR: [-14, 0, 0], thighL: [26, 0, 0], shinL: [50, 0, 0], footL: [-60, 0, 0] }), 'out'],
    [70, pose(), 'inout'],
  ] },

  stagger: { frames: 30, keys: [
    [0, pose()],
    [4, pose({ root: [0, -0.06, 0], spine: [-18, 0, 0], chest: [-20, 16, 0], head: [-30, -14, 0],
               upperArmR: [-10, -50, -36], foreArmR: [-20, 0, 0], handR: [70, 0, 0],
               upperArmL: [0, 30, 44], foreArmL: [-20, 0, 0], thighR: [-2, 0, 0], thighL: [26, 0, 0], shinL: [30, 0, 0] }), 'out'],
    [14, pose({ root: [0, -0.14, 0], spine: [14, 0, 0], chest: [8, 8, 0], head: [-6, -8, 0],
                upperArmR: [-20, -10, -16], foreArmR: [-50, 0, 0], handR: [70, 0, 0] }), 'inout'],
    [29, pose(), 'inout'],
  ] },
};

// ---- Pre-computation --------------------------------------------------------
const EASE = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inout: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

function compile(clip) {
  const keys = clip.keys.map(([f, p, ease], i) => {
    const src = p ?? clip.keys[0][1];
    const rot = {};
    for (const j of JOINT_NAMES) {
      const e = src[j] ?? [0, 0, 0];
      rot[j] = qEuler(e[0], e[1], e[2]);
    }
    return { f, root: src.root ?? [0, 0, 0], rot, ease: EASE[ease ?? 'linear'] };
  });
  return { ...clip, keys };
}
export const COMPILED = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, compile(c)]));

// Sample a clip at time t in frames (fractional allowed).
export function sampleClip(name, t) {
  const c = COMPILED[name];
  if (c.loop) t = ((t % c.frames) + c.frames) % c.frames;
  else t = Math.max(0, Math.min(c.frames - 1, t));
  const k = c.keys;
  let i = 0;
  while (i < k.length - 2 && t >= k[i + 1].f) i++;
  const a = k[i], b = k[i + 1];
  const u = b.f > a.f ? Math.max(0, Math.min(1, (t - a.f) / (b.f - a.f))) : 1;
  const w = b.ease(u);
  const rot = {};
  for (const j of JOINT_NAMES) rot[j] = qSlerp(a.rot[j], b.rot[j], w);
  return { rot, root: lerp3(a.root, b.root, w) };
}

export function blendPose(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const rot = {};
  for (const j of JOINT_NAMES) rot[j] = qSlerp(a.rot[j], b.rot[j], w);
  return { rot, root: lerp3(a.root, b.root, w) };
}

// ---- Animation state (owned by the simulation) ------------------------------
// The current clip plays from its own time; on a state change the outgoing
// pose keeps playing underneath and fades out over `blend` frames.
export function animStart(anim, clip, blendFrames, time = 0, speed = 1) {
  const outgoing = anim ? animPose(anim) : null;
  return {
    clip, t: time, speed,
    from: blendFrames > 0 && outgoing ? { src: anim, frozen: outgoing } : null,
    blend: blendFrames, k: 0,
  };
}

export function animAdvance(anim) {
  anim.t += anim.speed ?? 1;
  if (anim.from) {
    anim.k += 1;
    if (anim.from.src) animAdvance(anim.from.src);
    if (anim.k >= anim.blend) anim.from = null;
  }
}

const smooth = t => t * t * (3 - 2 * t);
export function animPose(anim, offset = 0) {
  const cur = sampleClip(anim.clip, anim.t + offset);
  if (!anim.from) return cur;
  const w = smooth(Math.min(1, Math.max(0, (anim.k + offset) / anim.blend)));
  const under = anim.from.src ? animPose(anim.from.src, offset) : anim.from.frozen;
  return blendPose(under, cur, w);
}

// ---- World space -------------------------------------------------------------
export function worldJoints(pose, pos, yaw, size = 1) {
  const out = {};
  const rootRot = qAxis([0, 1, 0], yaw);
  for (const j of JOINTS) {
    const local = pose.rot[j.name];
    if (!j.parent) {
      const off = add(j.offset, pose.root);
      out[j.name] = { pos: add([pos[0], 0, pos[2]], qRot(rootRot, [off[0] * size, off[1] * size, off[2] * size])),
                      rot: qMul(rootRot, local) };
    } else {
      const p = out[j.parent];
      const off = [j.offset[0] * size, j.offset[1] * size, j.offset[2] * size];
      out[j.name] = { pos: add(p.pos, qRot(p.rot, off)), rot: qMul(p.rot, local) };
    }
  }
  return out;
}

export function bladeSegment(world, bladeLength = BLADE.length) {
  const h = world.handR;
  return [add(h.pos, qRot(h.rot, [0, 0, BLADE.hilt])),
          add(h.pos, qRot(h.rot, [0, 0, BLADE.hilt + bladeLength]))];
}

export { qIdent };
