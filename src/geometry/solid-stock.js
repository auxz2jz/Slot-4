import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.consolidateGroups = false;

const EPS = 0.01;

function radians(value = 0) {
  return THREE.MathUtils.degToRad(Number(value) || 0);
}

function latestEndCut(operations, end) {
  const matches = (operations || []).filter(operation => operation.type === 'endCut' && operation.end === end);
  return matches.at(-1) || { miter: 0, bevel: 0 };
}

function makeCompoundPrism(length, width, thickness, operations = []) {
  const a = latestEndCut(operations, 'A');
  const b = latestEndCut(operations, 'B');
  const ta = Math.tan(radians(THREE.MathUtils.clamp(a.miter || 0, -60, 60)));
  const tba = Math.tan(radians(THREE.MathUtils.clamp(a.bevel || 0, -60, 60)));
  const tb = Math.tan(radians(THREE.MathUtils.clamp(b.miter || 0, -60, 60)));
  const tbb = Math.tan(radians(THREE.MathUtils.clamp(b.bevel || 0, -60, 60)));

  const ys = [-width / 2, width / 2];
  const zs = [-thickness / 2, thickness / 2];
  const positions = [];

  for (const z of zs) {
    for (const y of ys) {
      positions.push(-length / 2 + y * ta + z * tba, y, z);
    }
  }
  for (const z of zs) {
    for (const y of ys) {
      positions.push(length / 2 + y * tb + z * tbb, y, z);
    }
  }

  // Vertex order after the loops:
  // 0 A(-y,-z), 1 A(+y,-z), 2 A(-y,+z), 3 A(+y,+z)
  // 4 B(-y,-z), 5 B(+y,-z), 6 B(-y,+z), 7 B(+y,+z)
  const indices = [
    0, 2, 3, 0, 3, 1, // End A
    4, 5, 7, 4, 7, 6, // End B
    0, 1, 5, 0, 5, 4, // Bottom
    2, 6, 7, 2, 7, 3, // Top
    0, 4, 6, 0, 6, 2, // -Y side
    1, 3, 7, 1, 7, 5, // +Y side
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function notchCutterGeometry(notch, length, width, thickness) {
  const start = THREE.MathUtils.clamp(Number(notch.start) || 0, 0, length);
  const notchLength = THREE.MathUtils.clamp(Number(notch.length) || 1, EPS, Math.max(EPS, length - start));
  const face = notch.face || 'top';
  const topBottom = face === 'top' || face === 'bottom';
  const cross = topBottom ? width : thickness;
  const maxDepth = topBottom ? thickness : width;
  const offset = THREE.MathUtils.clamp(Number(notch.offset) || 0, 0, Math.max(0, cross - EPS));
  const span = THREE.MathUtils.clamp(Number(notch.span) || cross, EPS, Math.max(EPS, cross - offset));
  const depth = THREE.MathUtils.clamp(Number(notch.depth) || maxDepth / 2, EPS, maxDepth);

  const x = -length / 2 + start + notchLength / 2;
  let y = 0;
  let z = 0;
  let sx = notchLength + EPS * 2;
  let sy;
  let sz;

  if (topBottom) {
    sy = span + EPS * 2;
    sz = depth + EPS;
    y = -width / 2 + offset + span / 2;
    z = face === 'top'
      ? thickness / 2 - depth / 2 + EPS / 2
      : -thickness / 2 + depth / 2 - EPS / 2;
  } else {
    sy = depth + EPS;
    sz = span + EPS * 2;
    y = face === 'front'
      ? width / 2 - depth / 2 + EPS / 2
      : -width / 2 + depth / 2 - EPS / 2;
    z = -thickness / 2 + offset + span / 2;
  }

  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  geometry.deleteAttribute('uv');
  geometry.translate(x, y, z);
  return geometry;
}

function subtractNotch(baseGeometry, notch, dims) {
  const [length, width, thickness] = dims;
  const base = new Brush(baseGeometry);
  const cutterGeometry = notchCutterGeometry(notch, length, width, thickness);
  const cutter = new Brush(cutterGeometry);
  base.updateMatrixWorld(true);
  cutter.updateMatrixWorld(true);
  const result = evaluator.evaluate(base, cutter, SUBTRACTION);
  const geometry = result.geometry.clone();
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  baseGeometry.dispose();
  cutterGeometry.dispose();
  result.geometry.dispose();
  return geometry;
}

export function buildStockGeometry(definition, operations = []) {
  const dims = definition.dims.slice();
  let geometry = makeCompoundPrism(...dims, operations);
  for (const operation of operations || []) {
    if (operation.type === 'notch') geometry = subtractNotch(geometry, operation, dims);
  }
  geometry.boundsTree = new MeshBVH(geometry);
  return geometry;
}

export function makeStockMesh(definition, operations = []) {
  const geometry = buildStockGeometry(definition, operations);
  const material = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.72, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 22),
    new THREE.LineBasicMaterial({ color: 0x34312e }),
  );
  edges.userData.decorative = true;
  mesh.add(edges);
  return mesh;
}

export function summarizeOperations(operations = []) {
  const a = latestEndCut(operations, 'A');
  const b = latestEndCut(operations, 'B');
  const notches = operations.filter(operation => operation.type === 'notch');
  return {
    startMiter: Number(a.miter) || 0,
    startBevel: Number(a.bevel) || 0,
    endMiter: Number(b.miter) || 0,
    endBevel: Number(b.bevel) || 0,
    notches,
  };
}

export function replaceEndCut(operations = [], end, miter, bevel) {
  const filtered = operations.filter(operation => !(operation.type === 'endCut' && operation.end === end));
  const cleanMiter = THREE.MathUtils.clamp(Number(miter) || 0, -60, 60);
  const cleanBevel = THREE.MathUtils.clamp(Number(bevel) || 0, -60, 60);
  if (Math.abs(cleanMiter) > 0.0001 || Math.abs(cleanBevel) > 0.0001) {
    filtered.push({ type: 'endCut', end, miter: cleanMiter, bevel: cleanBevel });
  }
  return filtered;
}
