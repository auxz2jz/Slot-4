import * as THREE from 'three';
import { buildStockGeometry } from '../src/geometry/solid-stock.js';
import { partsOverlap } from '../src/geometry/collision.js';
import { createWallPlan } from '../src/editor/wall-framer.js';

function groupForGeometry(geometry) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

const notchedGeometry = buildStockGeometry(
  { dims: [24, 3.5, 3.5], color: 0xffffff },
  [{ type: 'notch', face: 'top', start: 8, length: 4, offset: 0, span: 3.5, depth: 1.75 }],
);
if (!notchedGeometry.attributes.position?.count) throw new Error('Notched geometry was not generated.');

const notched = groupForGeometry(notchedGeometry);
const insert = groupForGeometry(buildStockGeometry({ dims: [4, 3.5, 1.75], color: 0xffffff }, []));
insert.position.set(-2, 0, 0.875);
insert.updateMatrixWorld(true);
if (partsOverlap(notched, insert)) throw new Error('A piece occupying the removed notch was incorrectly treated as a collision.');

insert.position.z = 0.5;
insert.updateMatrixWorld(true);
if (!partsOverlap(notched, insert)) throw new Error('A piece pushed into remaining solid wood was not detected as a collision.');

const horizontalTrim = buildStockGeometry(
  { dims: [24, 4, 4], color: 0xffffff },
  [{ type: 'trimPlane', normal: [0, 0, 1], constant: 0, keepSign: -1 }],
);
horizontalTrim.computeBoundingBox();
if (horizontalTrim.boundingBox.max.z > 0.03 || horizontalTrim.boundingBox.min.z > -1.9) {
  throw new Error(`Horizontal trim plane produced unexpected bounds: ${horizontalTrim.boundingBox.min.z} to ${horizontalTrim.boundingBox.max.z}`);
}

const n = new THREE.Vector3(-1, 0, 1).normalize();
const slopedTrim = buildStockGeometry(
  { dims: [24, 4, 8], color: 0xffffff },
  [{ type: 'trimPlane', normal: n.toArray(), constant: 0, keepSign: -1 }],
);
const positions = slopedTrim.getAttribute('position');
for (let i = 0; i < positions.count; i += 1) {
  const point = new THREE.Vector3().fromBufferAttribute(positions, i);
  if (-n.dot(point) < -0.04) throw new Error('Sloped trim retained a vertex on the discarded side of the plane.');
}

const wall = createWallPlan({
  length: 120,
  leftHeight: 96,
  rightHeight: 108,
  spacing: 16,
  studItemId: '2x4',
  doubleTop: true,
  opening: {
    type: 'door',
    offset: 36,
    width: 36,
    height: 82.5,
    headerItemId: '2x8',
  },
});
const roles = new Set(wall.pieces.map(piece => piece.role));
for (const role of ['bottom-plate', 'top-plate', 'common-stud', 'king-stud', 'jack-stud', 'header']) {
  if (!roles.has(role)) throw new Error(`Wall plan did not generate required role: ${role}`);
}
if (!wall.pieces.some(piece => piece.spec.operations?.some(operation => operation.type === 'endCut'))) {
  throw new Error('Sloped wall did not generate angled stud end cuts.');
}

console.log(`Smoke tests passed: ${notchedGeometry.attributes.position.count} notched vertices, trim planes verified, ${wall.pieces.length} wall pieces.`);
