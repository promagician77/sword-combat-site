// Runs the 60 Hz simulation from a display loop of any rate. Key events carry
// the time they happened (event.timeStamp in a browser); in "timestamped" mode
// each event is applied to the simulation frame it happened in, so the fight
// is identical at 30, 60 or 144 Hz. "naive" mode applies everything seen in a
// display frame to that frame's first simulation step, like polling input in
// Update(); it exists only so the difference can be measured.
import { step } from './sim.mjs';
export const STEP_MS = 1000 / 60;
const BUTTONS = new Set(['light', 'heavy', 'dodge']);

export class Driver {
  constructor(sim, { mode = 'timestamped', onStep = null } = {}) {
    this.sim = sim; this.mode = mode; this.onStep = onStep;
    this.queue = []; this.pending = []; this.held = new Set();
    this.started = false; this.scale = 1; this.bot = null;
  }
  push(ev) { this.queue.push(ev); }               // { type: 'down'|'up', key, time }
  setScale(scale, nowReal) {                      // slow motion without breaking timing
    if (this.started) { this.gameAnchor = this.toGame(nowReal); this.realAnchor = nowReal; }
    this.scale = scale;
  }
  toGame(t) { return this.gameAnchor + (t - this.realAnchor) * this.scale; }
  advance(nowReal) {
    if (!this.started) {
      this.started = true; this.realAnchor = nowReal; this.gameAnchor = 0; this.stepEnd = STEP_MS;
    }
    const ready = this.queue.filter(e => e.time <= nowReal);
    this.queue = this.queue.filter(e => e.time > nowReal);
    for (const e of ready) this.pending.push({ ...e, g: this.toGame(e.time) });
    this.pending.sort((a, b) => a.g - b.g);
    const gameNow = this.toGame(nowReal);
    let first = true;
    while (this.stepEnd <= gameNow) {
      const input = { move: [0, 0], light: false, heavy: false, dodge: false };
      let take;
      if (this.mode === 'naive') { take = first ? this.pending : []; if (first) this.pending = []; }
      else {
        let i = 0;
        while (i < this.pending.length && this.pending[i].g <= this.stepEnd) i++;
        take = this.pending.slice(0, i); this.pending = this.pending.slice(i);
      }
      for (const e of take) {
        if (BUTTONS.has(e.key)) { if (e.type === 'down') input[e.key] = true; }
        else if (e.type === 'down') this.held.add(e.key);
        else this.held.delete(e.key);
      }
      input.move = [(this.held.has('left') ? 1 : 0) - (this.held.has('right') ? 1 : 0),
                    (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0)];
      if (this.mapMove) input.move = this.mapMove(input.move);   // e.g. camera-relative movement
      if (this.bot) Object.assign(input, this.bot(this.sim, input));
      step(this.sim, input);
      this.onStep?.(this.sim, input);
      this.stepEnd += STEP_MS;
      first = false;
    }
    return Math.max(0, Math.min(1, (gameNow - (this.stepEnd - STEP_MS)) / STEP_MS));
  }
}

// A seeded stream of human-like inputs (presses, holds, pauses), in ms.
export function scriptedSession(seed = 3, seconds = 30) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ev = [];
  let t = 200 + r() * 100;
  while (t < seconds * 1000) {
    const k = r();
    if (k < 0.55) {                              // a burst of light presses
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { ev.push({ type: 'down', key: 'light', time: t }, { type: 'up', key: 'light', time: t + 40 + r() * 40 });
        t += 120 + r() * 260; }
      if (r() < 0.35) { ev.push({ type: 'down', key: 'heavy', time: t }, { type: 'up', key: 'heavy', time: t + 60 }); t += 300 + r() * 300; }
    } else if (k < 0.8) {                        // dodge, maybe with a direction
      const dir = ['left', 'right', 'down', null][Math.floor(r() * 4)];
      if (dir) ev.push({ type: 'down', key: dir, time: t - 30 });
      ev.push({ type: 'down', key: 'dodge', time: t }, { type: 'up', key: 'dodge', time: t + 50 });
      if (dir) ev.push({ type: 'up', key: dir, time: t + 200 + r() * 200 });
      t += 350 + r() * 300;
    } else {                                     // walk a little
      const dir = ['up', 'left', 'right', 'down'][Math.floor(r() * 4)];
      const hold = 150 + r() * 600;
      ev.push({ type: 'down', key: dir, time: t }, { type: 'up', key: dir, time: t + hold });
      t += hold + 80 + r() * 200;
    }
  }
  return ev.sort((x, y) => x.time - y.time);
}
