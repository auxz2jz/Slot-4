import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  MATERIAL_FAMILIES,
  getItemsForFamily,
  getLumber,
  getSheet,
  formatInches,
  resolveStockPart,
} from './model/material-catalog.js';

const BASE_PARTS = {
  cmu: { label: 'Cinder block', dims: [16, 8, 8], color: 0x9b9b9b },
  firebrick: { label: 'Firebrick', dims: [9, 4.5, 2.5], color: 0xe0ad3d },
  lid: { label: 'Lid', dims: [25.5, 19.5, 5.5], color: 0x34383d },
};

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe3e8);
const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 3000);
camera.position.set(70, -90, 65);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 12);
orbit.enableDamping = true;
orbit.touches.ONE = THREE.TOUCH.ROTATE;
orbit.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb7bcc3, 3));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(50, -40, 90);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(320, 640, 0x6f7882, 0xaeb5bd);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0.002;
scene.add(grid);
scene.add(new THREE.AxesHelper(12));

const workspace = new THREE.Group();
workspace.name = 'Workspace';
scene.add(workspace);

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
transform.setTranslationSnap(0.5);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
scene.add(transform.getHelper());
transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value; });

let selected = null;
let selectionOutline = null;
let fallbackSerial = 1;

function stableId() {
  return globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${fallbackSerial++}`;
}

function edgeify(mesh, color = 0x33363a) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color }),
  );
  mesh.add(edges);
  return mesh;
}

function box(w, d, h, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return edgeify(mesh);
}

function finishPart(group, definition, creationSpec) {
  group.userData = {
    isPart: true,
    id: stableId(),
    type: creationSpec.type || 'stock',
    dims: definition.dims.slice(),
    definition,
    creationSpec: structuredClone(creationSpec),
  };
  group.name = definition.label;
  group.traverse(object => { object.userData.root = group; });
  return group;
}

function makeCmu() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: BASE_PARTS.cmu.color, roughness: 0.88 });
  const L = 16, D = 8, H = 8, shell = 1.25, web = 1.25;
  g.add(box(L, shell, H, mat, 0, -(D - shell) / 2, 0));
  g.add(box(L, shell, H, mat, 0, (D - shell) / 2, 0));
  g.add(box(shell, D - 2 * shell, H, mat, -(L - shell) / 2, 0, 0));
  g.add(box(shell, D - 2 * shell, H, mat, (L - shell) / 2, 0, 0));
  g.add(box(web, D - 2 * shell, H, mat, 0, 0, 0));
  return finishPart(g, BASE_PARTS.cmu, { kind: 'base', type: 'cmu' });
}

function makeFirebrick() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: BASE_PARTS.firebrick.color, roughness: 0.8 });
  g.add(box(9, 4.5, 2.5, mat));
  return finishPart(g, BASE_PARTS.firebrick, { kind: 'base', type: 'firebrick' });
}

function makeLid() {
  const g = new THREE.Group();
  const hood = new THREE.MeshStandardMaterial({ color: BASE_PARTS.lid.color, roughness: 0.38, metalness: 0.22 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8afb6, roughness: 0.24, metalness: 0.75 });
  g.add(box(25.5, 19.5, 5.5, hood, 0, 0, 2.75));
  g.add(box(10, 0.65, 0.65, metal, 0, -11, 6.25));
  g.add(box(0.65, 0.65, 2.2, metal, -4.5, -11, 5.25));
  g.add(box(0.65, 0.65, 2.2, metal, 4.5, -11, 5.25));
  const hingeGeo = new THREE.CylinderGeometry(0.35, 0.35, 18, 24);
  hingeGeo.rotateZ(Math.PI / 2);
  const hinge = edgeify(new THREE.Mesh(hingeGeo, metal));
  hinge.position.set(0, 9.75, 0.4);
  g.add(hinge);
  return finishPart(g, BASE_PARTS.lid, { kind: 'base', type: 'lid' });
}

function makeStockPart(spec) {
  const definition = resolveStockPart(spec);
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.72 });
  const [length, width, thickness] = definition.dims;
  g.add(box(length, width, thickness, material));
  return finishPart(g, definition, { ...spec, kind: 'construction', type: 'stock' });
}

function createPartFromSpec(spec) {
  if (spec.kind === 'construction') return makeStockPart(spec);
  if (spec.type === 'cmu') return makeCmu();
  if (spec.type === 'firebrick') return makeFirebrick();
  return makeLid();
}

function addObject(object) {
  const [, , height] = object.userData.dims;
  const n = workspace.children.length;
  object.position.set((n % 5) * 12 - 24, Math.floor(n / 5) * 12, height / 2);
  workspace.add(object);
  select(object);
}

function addBasePart(type) {
  addObject(createPartFromSpec({ kind: 'base', type }));
}

function addStockPart(spec) {
  addObject(createPartFromSpec(spec));
}

function destroyOutline() {
  if (!selectionOutline) return;
  if (selectionOutline.parent) selectionOutline.parent.remove(selectionOutline);
  selectionOutline.geometry?.dispose?.();
  selectionOutline.material?.dispose?.();
  selectionOutline = null;
}

function selectionText(part) {
  const [w, d, h] = part.userData.dims;
  const p = part.position;
  const definition = part.userData.definition;
  let extra = '';
  if (definition?.family === 'lumber') {
    const offcut = Math.max(0, definition.stockLength - definition.cutLength);
    extra = ` · Stock ${formatInches(definition.stockLength)} · Cut ${formatInches(definition.cutLength)} · Offcut ${formatInches(offcut)}`;
  }
  return `${part.name} · ${formatInches(w)} × ${formatInches(d)} × ${formatInches(h)} · X ${p.x.toFixed(1)} Y ${p.y.toFixed(1)} Z ${p.z.toFixed(1)}${extra}`;
}

function updateSelectionInfo() {
  document.getElementById('selectionInfo').textContent = selected ? selectionText(selected) : 'Nothing selected.';
}

function select(object) {
  selected = object || null;
  transform.detach();
  destroyOutline();
  if (!selected) {
    updateSelectionInfo();
    return;
  }
  transform.attach(selected);
  const [w, d, h] = selected.userData.dims;
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, d, h));
  const mat = new THREE.LineBasicMaterial({ color: 0x005ee8, depthTest: false });
  selectionOutline = new THREE.LineSegments(geo, mat);
  selectionOutline.renderOrder = 999;
  selected.add(selectionOutline);
  updateSelectionInfo();
}

function duplicate() {
  if (!selected) return;
  const copy = createPartFromSpec(selected.userData.creationSpec);
  copy.position.copy(selected.position).add(new THREE.Vector3(0.5, 0.5, 0.5));
  copy.quaternion.copy(selected.quaternion);
  workspace.add(copy);
  select(copy);
}

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function removeSelected() {
  if (!selected) return;
  const doomed = selected;
  select(null);
  workspace.remove(doomed);
  disposeObject(doomed);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerdown', event => {
  if (transform.dragging) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(workspace.children, true);
  if (hits.length) select(hits[0].object.userData.root);
});

function setMode(mode) {
  transform.setMode(mode);
  document.getElementById('moveMode').classList.toggle('active', mode === 'translate');
  document.getElementById('rotateMode').classList.toggle('active', mode === 'rotate');
}

function setView(kind) {
  const target = orbit.target.clone();
  if (kind === 'top') {
    camera.up.set(0, 1, 0);
    camera.position.copy(target.clone().add(new THREE.Vector3(0, 0, 100)));
  } else {
    camera.up.set(0, 0, 1);
    if (kind === 'front') camera.position.copy(target.clone().add(new THREE.Vector3(0, -100, 0)));
    if (kind === 'iso') camera.position.copy(target.clone().add(new THREE.Vector3(65, -65, 55)));
  }
  orbit.update();
}

function frameAll() {
  if (!workspace.children.length) return;
  destroyOutline();
  const bounds = new THREE.Box3().setFromObject(workspace);
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(35, bounds.getSize(new THREE.Vector3()).length() * 1.2);
  orbit.target.copy(center);
  camera.up.set(0, 0, 1);
  camera.position.copy(center.clone().add(new THREE.Vector3(distance, -distance, distance * 0.75)));
  orbit.update();
  if (selected) select(selected);
}

function fillSelect(select, options, valueKey = 'id', labelKey = 'label') {
  select.innerHTML = '';
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option[valueKey];
    el.textContent = option[labelKey];
    select.append(el);
  }
}

const familySelect = document.getElementById('materialFamily');
const itemSelect = document.getElementById('materialItem');
const stockLengthSelect = document.getElementById('stockLength');
const cutLengthInput = document.getElementById('cutLength');
const thicknessSelect = document.getElementById('sheetThickness');
const lumberOptions = document.getElementById('lumberOptions');
const sheetOptions = document.getElementById('sheetOptions');
const materialPreview = document.getElementById('materialPreview');

fillSelect(familySelect, MATERIAL_FAMILIES);

function syncLengthOptions() {
  const item = getLumber(itemSelect.value);
  fillSelect(stockLengthSelect, item.lengths, 'value', 'label');
  const eightFoot = item.lengths.find(option => option.value === 96);
  stockLengthSelect.value = String(eightFoot?.value ?? item.lengths[0].value);
  cutLengthInput.value = stockLengthSelect.value;
}

function syncThicknessOptions() {
  const item = getSheet(itemSelect.value);
  thicknessSelect.innerHTML = '';
  for (const thickness of item.thicknesses) {
    const option = document.createElement('option');
    option.value = String(thickness);
    option.textContent = formatInches(thickness);
    thicknessSelect.append(option);
  }
  if (item.thicknesses.includes(0.75)) thicknessSelect.value = '0.75';
  else if (item.thicknesses.includes(0.5)) thicknessSelect.value = '0.5';
}

function currentStockSpec() {
  if (familySelect.value === 'sheet') {
    return {
      kind: 'construction',
      family: 'sheet',
      itemId: itemSelect.value,
      thickness: Number(thicknessSelect.value),
    };
  }
  const stockLength = Number(stockLengthSelect.value);
  const requested = Number(cutLengthInput.value);
  const cutLength = Number.isFinite(requested) && requested > 0 ? Math.min(requested, stockLength) : stockLength;
  return {
    kind: 'construction',
    family: 'lumber',
    itemId: itemSelect.value,
    stockLength,
    cutLength,
  };
}

function refreshMaterialPreview() {
  const definition = resolveStockPart(currentStockSpec());
  const [a, b, c] = definition.dims;
  let text = `${definition.label} · actual model ${formatInches(a)} × ${formatInches(b)} × ${formatInches(c)}`;
  if (definition.family === 'lumber') {
    text += ` · offcut ${formatInches(Math.max(0, definition.stockLength - definition.cutLength))}`;
  }
  materialPreview.textContent = text;
}

function syncMaterialPanel() {
  const family = familySelect.value;
  fillSelect(itemSelect, getItemsForFamily(family));
  lumberOptions.hidden = family !== 'lumber';
  sheetOptions.hidden = family !== 'sheet';
  if (family === 'lumber') syncLengthOptions();
  else syncThicknessOptions();
  refreshMaterialPreview();
}

familySelect.addEventListener('change', syncMaterialPanel);
itemSelect.addEventListener('change', () => {
  if (familySelect.value === 'lumber') syncLengthOptions();
  else syncThicknessOptions();
  refreshMaterialPreview();
});
stockLengthSelect.addEventListener('change', () => {
  cutLengthInput.value = stockLengthSelect.value;
  refreshMaterialPreview();
});
cutLengthInput.addEventListener('input', refreshMaterialPreview);
thicknessSelect.addEventListener('change', refreshMaterialPreview);
document.getElementById('addMaterial').addEventListener('click', () => addStockPart(currentStockSpec()));

syncMaterialPanel();

document.getElementById('addCmu').addEventListener('click', () => addBasePart('cmu'));
document.getElementById('addFirebrick').addEventListener('click', () => addBasePart('firebrick'));
document.getElementById('addLid').addEventListener('click', () => addBasePart('lid'));
document.getElementById('moveMode').addEventListener('click', () => setMode('translate'));
document.getElementById('rotateMode').addEventListener('click', () => setMode('rotate'));
document.getElementById('duplicate').addEventListener('click', duplicate);
document.getElementById('deletePart').addEventListener('click', removeSelected);
document.getElementById('topView').addEventListener('click', () => setView('top'));
document.getElementById('frontView').addEventListener('click', () => setView('front'));
document.getElementById('isoView').addEventListener('click', () => setView('iso'));
document.getElementById('frameAll').addEventListener('click', frameAll);
document.getElementById('settingsButton').addEventListener('click', () => document.getElementById('settingsPanel').classList.toggle('hidden'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsPanel').classList.add('hidden'));
document.getElementById('materialsButton').addEventListener('click', () => document.getElementById('materialsPanel').classList.toggle('hidden'));
document.getElementById('closeMaterials').addEventListener('click', () => document.getElementById('materialsPanel').classList.add('hidden'));
document.getElementById('translationSnap').addEventListener('change', event => transform.setTranslationSnap(event.target.checked ? 0.5 : null));
document.getElementById('rotationSnap').addEventListener('change', event => transform.setRotationSnap(THREE.MathUtils.degToRad(Number(event.target.value) || 15)));

transform.addEventListener('objectChange', updateSelectionInfo);

addBasePart('cmu');
addBasePart('firebrick');
addBasePart('lid');
select(null);

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function loop() {
  resize();
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
