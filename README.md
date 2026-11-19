# Sword combat, frame by frame: demo page

Static files, no build step: `index.html`, `style.css`, `js/`, `combat/`, `vendor/three.*.js`, `fonts/`, `data/`.
Deploy with Vercel; `vercel.json` sends `X-Robots-Tag: noindex, nofollow`. Prepared by Carter.

## Measured

Numbers come from `results/*.json`, written by `tools/run_tests.mjs`, `tools/measure.mjs`, `tools/mutate.mjs` and `tools/site_qa.mjs`.
Frames are counted from 1, the frame the button was pressed.

| What | Result |
|---|---|
| Tests | 21 tests, 0 failing |
| Planted bugs caught | 21 of 21 (see `results/mutation.json`) |
| Frame data | every measured value matched the design (table below) |
| Dodge invulnerability | frames 4-15, measured from slams that overlapped the player; hits landed on frames either side |
| Input buffer | a press up to 10 frames before a window opens still fires on its first frame |
| Same fight at every refresh rate (timestamped input) | 7 of 7 rates (30, 60, 75, 120, 144, 240 Hz and jittered 4-40 ms) |
| Input read once per display frame | changed the fight at 6 of 7 rates; up to 76 of 94 presses moved at 30 Hz |
| Thin targets missed (5-15 cm radius, 456 real passes) | 1 check per frame: 370; 4 per frame: 146; 8 per frame: 35; spaced by tip distance (max 5 cm): 2 |
| Checks per active frame (spaced) | about 30 |
| Transition jumps over 45 degrees | hard cuts 42 of 126; blends 3 (all dodge cancels, which blend in 2 frames on purpose) |
| Fastest swing frame inside the active window | 4 of 4 attacks |
| Simulation cost | 0.021 ms per frame in Node v22.23.4, hit checks included |
| Page checks | 37 of 37 (Playwright and axe, desktop and phone) |

| Move | Startup / active / recovery | Total, measured | Cancel window | Dodge cancel from | Hit-stop | First hit at 1.6 m |
|---|---|---|---|---|---|---|
| light1 | 7 / 4 / 16 | 27 (design 27) | 12-23 | 14 | 4 | frame 10 |
| light2 | 6 / 4 / 18 | 28 (design 28) | 11-22 | 13 | 4 | frame 8 |
| light3 | 10 / 5 / 26 | 41 (design 41) | none | 23 | 7 | frame 13 |
| heavy | 18 / 5 / 28 | 51 (design 51) | none | 31 | 9 | frame 21 |

## Not measured

- This is not Unity. It is JavaScript and three.js so it runs in a browser; the Unity mapping on the page is a plan, not tested Unity code.
- The mannequin animation is hand-keyed in code: no rig, no IK, no foot locking, no mocap. It shows timing and readability, not shipped-game polish.
- One enemy with simple seeded behaviour; no physics engine; no networking.
- The thin-target "truth" is 256 blade samples per frame, not an exact swept-volume test.
- Refresh rates were simulated by feeding the driver frame times; no real monitors.
- Costs were measured in Node on a 2-core sandbox, not on target hardware. Screenshots and page checks used software WebGL.
