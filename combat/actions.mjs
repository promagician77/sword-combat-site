// Frame data at 60 frames per second. "startup" is the number of frames
// before the first active frame; an attack pressed on frame N can first hit on
// frame N + startup. Cancel windows are [from, to) in the action's own frames.
export const FPS = 60;
export const BUFFER_FRAMES = 10;  // a press is remembered this many frames
export const HIT_SPACING = 0.05;  // m: blade samples are at most this far apart at the tip
export const HIT_MAX_SAMPLES = 96;

export const ACTIONS = {
  light1: { kind: 'attack', clip: 'light1', startup: 7, active: 4, recovery: 16, damage: 10, poise: 10, hitstop: 4,
            cancel: { light: 'light2', heavy: 'heavy', from: 11, to: 23 }, dodgeFrom: 13, steer: 4,
            lunge: { from: 2, to: 10, dist: 0.35 }, blendIn: 3 },
  light2: { kind: 'attack', clip: 'light2', startup: 6, active: 4, recovery: 18, damage: 10, poise: 10, hitstop: 4,
            cancel: { light: 'light3', heavy: 'heavy', from: 10, to: 22 }, dodgeFrom: 12, steer: 4,
            lunge: { from: 1, to: 9, dist: 0.30 }, blendIn: 4 },
  light3: { kind: 'attack', clip: 'light3', startup: 10, active: 5, recovery: 26, damage: 18, poise: 15, hitstop: 7,
            cancel: null, dodgeFrom: 22, steer: 6, lunge: { from: 3, to: 14, dist: 0.55 }, blendIn: 4 },
  heavy:  { kind: 'attack', clip: 'heavy', startup: 18, active: 5, recovery: 28, damage: 30, poise: 30, hitstop: 9,
            cancel: null, dodgeFrom: 30, steer: 10, lunge: { from: 12, to: 22, dist: 0.9 }, blendIn: 4 },
  dodge:  { kind: 'dodge', clip: 'dodge', total: 24, iframes: [3, 15], attackFrom: 18,
            lunge: { from: 0, to: 14, dist: 3.0 }, blendIn: 2 },
  hitstun: { kind: 'hitstun', clip: 'hitstun', total: 22, lunge: { from: 0, to: 8, dist: -0.7 }, blendIn: 1 },
};
for (const a of Object.values(ACTIONS)) {
  if (a.kind === 'attack') a.total = a.startup + a.active + a.recovery;
}

export const ENEMY_ACTIONS = {
  slam: { kind: 'attack', clip: 'slam', startup: 32, active: 5, recovery: 34, damage: 20, hitstop: 6,
          track: 20, lunge: { from: 30, to: 37, dist: 0.5 }, blendIn: 6 },
  stagger: { kind: 'hitstun', clip: 'stagger', total: 30, lunge: { from: 0, to: 10, dist: -0.45 }, blendIn: 1 },
};
ENEMY_ACTIONS.slam.total = ENEMY_ACTIONS.slam.startup + ENEMY_ACTIONS.slam.active + ENEMY_ACTIONS.slam.recovery;

export const BLEND = { toIdle: 8, idleRun: 6 };

export const PLAYER = { radius: 0.35, runSpeed: 4.2 / FPS, turnRate: 0.30, size: 1, bladeLength: 1.0,
                        hurt: { y0: 0.25, y1: 1.6, r: 0.30 } };
export const ENEMY = { radius: 0.45, walkSpeed: 1.5 / FPS, turnRate: 0.06, size: 1.15, bladeLength: 1.3,
                       hurt: { y0: 0.25, y1: 1.85, r: 0.36 }, poise: 30, poiseRegen: 90,
                       engage: 2.6, keep: 2.0 };

// Phase of an action frame, for the frame meter and the measurements.
export function phase(action, sf) {
  if (!action) return 'neutral';
  if (action.kind === 'attack') {
    if (sf < action.startup) return 'startup';
    if (sf < action.startup + action.active) return 'active';
    return 'recovery';
  }
  if (action.kind === 'dodge') return sf >= action.iframes[0] && sf < action.iframes[1] ? 'invulnerable' : 'dodge';
  return 'hitstun';
}
