// Builds a stylised mannequin with a sword and poses it from worldJoints().
import * as THREE from '../vendor/three.module.js';
import { JOINTS, BLADE } from '../combat/anim.mjs';

const childOf = {};
for (const j of JOINTS) if (j.parent && !childOf[j.parent]) childOf[j.parent] = j;
const LIMB_R = { upperArmR: .052, foreArmR: .045, upperArmL: .052, foreArmL: .045,
                 thighR: .072, shinR: .056, thighL: .072, shinL: .056, neck: .045 };

function limb(radius, from, to, mat) {
  const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const l = dir.length();
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, l - radius * 0.6), 4, 10);
  const m = new THREE.Mesh(g, mat);
  m.position.set(...from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  m.castShadow = true;
  return m;
}

export function makeMannequin({ body = 0xE6E0D3, joint = 0x2B2F38, blade = 0xC9D1DA, size = 1,
                                bladeLength = BLADE.length } = {}) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: body, roughness: .62, metalness: .02 });
  const jointMat = new THREE.MeshStandardMaterial({ color: joint, roughness: .55 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: blade, roughness: .22, metalness: .85 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x3A2A1E, roughness: .8 });
  const root = new THREE.Group();
  const nodes = {};
  for (const j of JOINTS) {
    const n = new THREE.Group();
    nodes[j.name] = n;
    root.add(n);
    const c = childOf[j.name];
    if (LIMB_R[j.name] && c) n.add(limb(LIMB_R[j.name], [0, 0, 0], c.offset, bodyMat));
    if (/Arm|thigh|shin/.test(j.name)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(LIMB_R[j.name] * 1.12, 12, 8), jointMat);
      s.castShadow = true;
      n.add(s);
    }
  }
  const box = (w, h, d, mat, at, r = 0.04) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat);
    m.position.set(...at); m.castShadow = true; return m;
  };
  nodes.hips.add(box(.30, .16, .19, bodyMat, [0, .02, 0]));
  nodes.spine.add(limb(.10, [0, -0.02, 0], [0, .20, 0], bodyMat));
  const chest = box(.38, .30, .21, bodyMat, [0, .12, 0]);
  nodes.chest.add(chest);
  nodes.chest.add(box(.40, .06, .23, jointMat, [0, .25, 0]));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.115, 20, 14), bodyMat);
  head.position.set(0, .07, .005); head.scale.set(.92, 1.08, 1); head.castShadow = true;
  nodes.head.add(head);
  const visor = box(.17, .035, .03, jointMat, [0, .085, .1]);
  nodes.head.add(visor);
  for (const s of ['R', 'L']) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), jointMat);
    h.castShadow = true;
    nodes['hand' + s].add(h);
    nodes['foot' + s].add(box(.10, .07, .25, jointMat, [0, -0.02, .06]));
  }
  // Sword along the hand's +z.
  const sword = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.018, .02, .2, 10), gripMat);
  grip.rotation.x = Math.PI / 2; grip.position.z = -0.04; sword.add(grip);
  sword.add(box(.22, .035, .04, jointMat, [0, 0, BLADE.hilt]));
  const bl = new THREE.Mesh(new THREE.BoxGeometry(.055, .012, bladeLength * .92), bladeMat);
  bl.position.z = BLADE.hilt + bladeLength * .46; bl.castShadow = true; sword.add(bl);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.039, bladeLength * .08, 4), bladeMat);
  tip.rotation.x = Math.PI / 2; tip.rotation.y = Math.PI / 4; tip.scale.z = .3;
  tip.position.z = BLADE.hilt + bladeLength * .96; sword.add(tip);
  nodes.handR.add(sword);
  root.scale.setScalar(1);
  return { root, nodes, size, bodyMat, jointMat };
}

export function applyWorld(m, world) {
  for (const j of JOINTS) {
    const w = world[j.name], n = m.nodes[j.name];
    n.position.set(w.pos[0], w.pos[1], w.pos[2]);
    n.quaternion.set(w.rot[0], w.rot[1], w.rot[2], w.rot[3]);
    n.scale.setScalar(m.size);
  }
}
