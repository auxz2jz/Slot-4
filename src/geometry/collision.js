import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const CONTACT_EPS = 0.01;
const RAY_DIR = new THREE.Vector3(0.8123, 0.3371, 0.4759).normalize();

export function ensureBoundsTree(geometry) {
  if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry;
}

function collisionMeshes(root) {
  const meshes = [];
  root.traverse(object => {
    if (object.isMesh && !object.userData.decorative && object.geometry?.attributes?.position) {
      ensureBoundsTree(object.geometry);
      meshes.push(object);
    }
  });
  return meshes;
}

function uniqueHitCount(hits) {
  const distances = hits
    .map(hit => hit.distance)
    .filter(distance => distance > CONTACT_EPS)
    .sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const distance of distances) {
    if (Math.abs(distance - last) > CONTACT_EPS) {
      count += 1;
      last = distance;
    }
  }
  return count;
}

function pointInsideGeometry(geometry, point) {
  ensureBoundsTree(geometry);
  const ray = new THREE.Ray(point.clone(), RAY_DIR);
  const hits = geometry.boundsTree.raycast(ray, THREE.DoubleSide, CONTACT_EPS, Infinity);
  return uniqueHitCount(hits) % 2 === 1;
}

function shrinkMatrixForGeometry(geometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const sx = size.x > CONTACT_EPS * 4 ? Math.max(0.9, (size.x - CONTACT_EPS * 2) / size.x) : 1;
  const sy = size.y > CONTACT_EPS * 4 ? Math.max(0.9, (size.y - CONTACT_EPS * 2) / size.y) : 1;
  const sz = size.z > CONTACT_EPS * 4 ? Math.max(0.9, (size.z - CONTACT_EPS * 2) / size.z) : 1;
  return new THREE.Matrix4()
    .makeTranslation(center.x, center.y, center.z)
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
}

function firstVertex(geometry, transform) {
  const position = geometry.attributes.position;
  return new THREE.Vector3(position.getX(0), position.getY(0), position.getZ(0)).applyMatrix4(transform);
}

function meshesOverlap(a, b) {
  a.updateMatrixWorld(true);
  b.updateMatrixWorld(true);
  const worldA = new THREE.Box3().setFromObject(a);
  const worldB = new THREE.Box3().setFromObject(b);
  if (!worldA.intersectsBox(worldB)) return false;

  ensureBoundsTree(a.geometry);
  ensureBoundsTree(b.geometry);

  const bToA = new THREE.Matrix4()
    .copy(a.matrixWorld).invert()
    .multiply(b.matrixWorld)
    .multiply(shrinkMatrixForGeometry(b.geometry));

  if (a.geometry.boundsTree.intersectsGeometry(b.geometry, bToA)) return true;

  // Surface intersection is not enough for the case where one closed solid is
  // completely contained in another, so test one vertex in both directions.
  const bPointInA = firstVertex(b.geometry, bToA);
  if (pointInsideGeometry(a.geometry, bPointInA)) return true;

  const aToB = new THREE.Matrix4()
    .copy(b.matrixWorld).invert()
    .multiply(a.matrixWorld)
    .multiply(shrinkMatrixForGeometry(a.geometry));
  const aPointInB = firstVertex(a.geometry, aToB);
  return pointInsideGeometry(b.geometry, aPointInB);
}

export function partsOverlap(a, b) {
  const meshesA = collisionMeshes(a);
  const meshesB = collisionMeshes(b);
  for (const meshA of meshesA) {
    for (const meshB of meshesB) {
      if (meshesOverlap(meshA, meshB)) return true;
    }
  }
  return false;
}

export function penetratesGround(part) {
  part.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(part);
  return bounds.min.z < -CONTACT_EPS;
}

export function partCollides(part, parts, { ground = true } = {}) {
  if (ground && penetratesGround(part)) return true;
  for (const other of parts) {
    if (other === part || other.userData?.ignoreCollision) continue;
    if (partsOverlap(part, other)) return true;
  }
  return false;
}

function quaternionAngle(a, b) {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

export function applySweptTransform(part, start, target, parts, options = {}) {
  const distance = start.position.distanceTo(target.position);
  const angle = quaternionAngle(start.quaternion, target.quaternion);
  const moveSteps = Math.ceil(distance / (options.translationStep || 0.25));
  const rotationSteps = Math.ceil(angle / THREE.MathUtils.degToRad(options.rotationStepDeg || 2));
  const steps = Math.max(1, Math.min(80, Math.max(moveSteps, rotationSteps)));

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    pos.lerpVectors(start.position, target.position, t);
    quat.slerpQuaternions(start.quaternion, target.quaternion, t);
    part.position.copy(pos);
    part.quaternion.copy(quat);
    part.updateMatrixWorld(true);
    if (partCollides(part, parts, options)) {
      part.position.copy(start.position);
      part.quaternion.copy(start.quaternion);
      part.updateMatrixWorld(true);
      return false;
    }
  }
  return true;
}
