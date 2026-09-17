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

console.log(`Smoke tests passed: ${notchedGeometry.attributes.position.count} notched vertices, ${wall.pieces.length} wall pieces.`);
