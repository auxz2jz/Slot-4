import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  getItemsForFamily,
  getLumber,
  getSheet,
  formatInches,
  resolveStockPart,
} from './model/material-catalog.js';
import {
  makeStockMesh,
  summarizeOperations,
  replaceEndCut,
} from './geometry/solid-stock.js';
import {
  ensureBoundsTree,
  applySweptTransform,
} from './geometry/collision.js';
import { createWallPlan } from './editor/wall-framer.js';

const BASE_PARTS = {
  cmu: { label: 'Concrete masonry unit (CMU)', shortLabel: 'Cinder block', dims: [16, 8, 8], color: 0x9b9b9b, family: 'masonry' },
  firebrick: { label: 'Firebrick', shortLabel: 'Firebrick', dims: [9, 4.5, 2.5], color: 0xe0ad3d, family: 'masonry' },
  lid: { label: 'Smoker lid', shortLabel: 'Smoker lid', dims: [25.5, 19.5, 5.5], color: 0x34383d, family: 'smoker' },
};

const COMPONENT_LIBRARY = {
  masonry: [
    { id: 'cmu', label: 'Concrete masonry unit (16 × 8 × 8 in)' },
    { id: 'firebrick', label: 'Firebrick (9 × 4.5 × 2.5 in)' },
  ],
  smoker: [
    { id: 'lid', label: 'Smoker lid (approx. 25.5 × 19.5 × 5.5 in)' },
  ],
};

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9e0e5);
const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 5000);
camera.position.set(95, -125, 85);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 30);
orbit.enableDamping = true;
orbit.touches.ONE = THREE.TOUCH.ROTATE;
orbit.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight(0xffffff, 0xaab5bf, 3));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(70, -55, 120);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(480, 960, 0x71808d, 0xb5bec6);
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
const selectedParts = new Set();
const selectionOutlines = new Map();
let multiSelectMode = false;
let fallbackSerial = 1;
let lastValidTransform = null;
let validatingTransform = false;
let draftNotches = [];
let resetAllCutsRequested = false;
let trimPreview = null;

function stableId() {
  return globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${fallbackSerial++}`;
}

function edgeify(mesh, color = 0x33363a) {
  ensureBoundsTree(mesh.geometry);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color }));
  edges.userData.decorative = true;
  mesh.add(edges);
  return mesh;
}

function box(w, d, h, material, x = 0, y = 0, z = 0) {
  const geometry = new THREE.BoxGeometry(w, d, h);
  ensureBoundsTree(geometry);
  const mesh = new THREE.Mesh(geometry, material);
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
    role: creationSpec.role || null,
    assemblyId: creationSpec.assemblyId || null,
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
  ensureBoundsTree(hingeGeo);
  const hinge = edgeify(new THREE.Mesh(hingeGeo, metal));
  hinge.position.set(0, 9.75, 0.4);
  g.add(hinge);
  return finishPart(g, BASE_PARTS.lid, { kind: 'base', type: 'lid' });
}

function makeStockPart(spec) {
  const definition = resolveStockPart(spec);
  const operations = structuredClone(spec.operations || []);
  const g = new THREE.Group();
  const mesh = makeStockMesh(definition, operations);
  g.add(mesh);
  const finished = finishPart(g, definition, { ...spec, operations, kind: 'construction', type: 'stock' });
  mesh.geometry.computeBoundingBox();
  const actualSize = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  finished.userData.dims = [actualSize.x, actualSize.y, actualSize.z];
  return finished;
}

function createPartFromSpec(spec) {
  if (spec.kind === 'construction') return makeStockPart(spec);
  if (spec.type === 'cmu') return makeCmu();
  if (spec.type === 'firebrick') return makeFirebrick();
  return makeLid();
}

function applyDegrees(object, rotation = [0, 0, 0]) {
  object.rotation.set(THREE.MathUtils.degToRad(Number(rotation[0]) || 0), THREE.MathUtils.degToRad(Number(rotation[1]) || 0), THREE.MathUtils.degToRad(Number(rotation[2]) || 0));
}

function addObject(object, options = {}) {
  const [, , height] = object.userData.dims;
  if (options.position) object.position.fromArray(options.position);
  else {
    const n = workspace.children.length;
    object.position.set((n % 3) * 18 - 18, Math.floor(n / 3) * 18, height / 2);
  }
  if (options.rotation) applyDegrees(object, options.rotation);
  if (options.role) {
    object.userData.role = options.role;
    object.userData.creationSpec.role = options.role;
    object.name = `${options.role.replaceAll('-', ' ')} · ${object.name}`;
  }
  if (options.assemblyId) {
    object.userData.assemblyId = options.assemblyId;
    object.userData.creationSpec.assemblyId = options.assemblyId;
  }
  workspace.add(object);
  object.updateMatrixWorld(true);
  if (options.select !== false) setSelection([object]);
  refreshProjectObjectList();
  return object;
}

function addBasePart(type) { return addObject(createPartFromSpec({ kind: 'base', type })); }
function addStockPart(spec) { return addObject(createPartFromSpec(spec)); }

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.boundsTree?.dispose?.();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function selectedArray() { return [...selectedParts]; }
function isEditableStock(part = selected) { return part?.userData?.creationSpec?.kind === 'construction'; }
function selectedStockParts() { return selectedArray().filter(isEditableStock); }
function snapshotTransform(object) { return { position: object.position.clone(), quaternion: object.quaternion.clone() }; }

function clearSelectionOutlines() {
  for (const helper of selectionOutlines.values()) {
    scene.remove(helper);
    helper.geometry?.dispose?.();
    helper.material?.dispose?.();
  }
  selectionOutlines.clear();
}

function rebuildSelectionOutlines() {
  clearSelectionOutlines();
  for (const part of selectedParts) {
    const helper = new THREE.BoxHelper(part, part === selected ? 0x1769d2 : 0x55a4ff);
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = part === selected ? 0.95 : 0.72;
    helper.renderOrder = 999;
    scene.add(helper);
    selectionOutlines.set(part, helper);
  }
}

function selectionText(part) {
  const p = part.position;
  const definition = part.userData.definition;
  const role = part.userData.role ? `${part.userData.role.replaceAll('-', ' ')} · ` : '';
  let extra = '';
  if (definition?.family === 'lumber') {
    const offcut = Math.max(0, definition.stockLength - definition.cutLength);
    extra = ` · Stock ${formatInches(definition.stockLength)} · Piece ${formatInches(definition.cutLength)} · Linear offcut ${formatInches(offcut)}`;
  } else if (definition?.family === 'sheet') extra = ` · Stock 96 × 48 in · Piece ${formatInches(definition.cutLength)} × ${formatInches(definition.cutWidth)}`;
  const opCount = part.userData.creationSpec?.operations?.length || 0;
  if (opCount) extra += ` · ${opCount} cut operation${opCount === 1 ? '' : 's'}`;
  return `${role}${part.name} · X ${p.x.toFixed(2)} Y ${p.y.toFixed(2)} Z ${p.z.toFixed(2)}${extra}`;
}

function syncTransformAttachment() {
  transform.detach();
  if (selectedParts.size === 1 && selected) {
    transform.attach(selected);
    lastValidTransform = snapshotTransform(selected);
  } else lastValidTransform = null;
}

function updateSelectionInfo() {
  const count = selectedParts.size;
  const stockCount = selectedStockParts().length;
  const status = document.getElementById('selectionStatus');
  const info = document.getElementById('selectionInfo');
  const oneEditable = count === 1 && isEditableStock(selected);
  if (!count) {
    status.textContent = 'Nothing selected';
    info.textContent = 'Nothing selected.';
  } else if (count === 1) {
    status.textContent = selectionText(selected);
    info.textContent = selectionText(selected);
  } else {
    const message = `${count} objects selected · ${stockCount} trimmable stock piece${stockCount === 1 ? '' : 's'} · move/rotate works with one object at a time`;
    status.textContent = message;
    info.textContent = message;
  }
  document.getElementById('cutButton').disabled = !oneEditable;
  document.getElementById('trimButton').disabled = stockCount === 0;
  document.getElementById('duplicate').disabled = count === 0;
  document.getElementById('deletePart').disabled = count === 0;
  document.getElementById('clearSelectionButton').disabled = count === 0;
  document.getElementById('clearSelectionMenu').disabled = count === 0;
}

function refreshSelectionState() {
  syncTransformAttachment();
  rebuildSelectionOutlines();
  updateSelectionInfo();
  syncCutPanelFromSelection();
  syncTrimSelectionInfo();
  refreshProjectObjectList();
}

function setSelection(parts = [], primary = null) {
  selectedParts.clear();
  for (const part of parts) if (part?.parent === workspace) selectedParts.add(part);
  selected = primary && selectedParts.has(primary) ? primary : [...selectedParts].at(-1) || null;
  refreshSelectionState();
}

function select(object, { additive = false, toggle = false } = {}) {
  if (!object) {
    if (!additive) setSelection([]);
    return;
  }
  if (!additive) {
    setSelection([object], object);
    return;
  }
  if (toggle && selectedParts.has(object)) {
    selectedParts.delete(object);
    selected = [...selectedParts].at(-1) || null;
  } else {
    selectedParts.add(object);
    selected = object;
  }
  refreshSelectionState();
}

function duplicateSelection() {
  const originals = selectedArray();
  if (!originals.length) return;
  const copies = [];
  for (const source of originals) {
    const copy = createPartFromSpec(source.userData.creationSpec);
    copy.position.copy(source.position).add(new THREE.Vector3(0.5, 0.5, 0.5));
    copy.quaternion.copy(source.quaternion);
    copy.userData.role = source.userData.role;
    copy.userData.assemblyId = source.userData.assemblyId;
    copy.name = source.name;
    workspace.add(copy);
    copy.updateMatrixWorld(true);
    copies.push(copy);
  }
  setSelection(copies, copies.at(-1));
}

function removeSelection() {
  const doomed = selectedArray();
  if (!doomed.length) return;
  setSelection([]);
  for (const object of doomed) {
    workspace.remove(object);
    disposeObject(object);
  }
  refreshProjectObjectList();
}

function replacePartWithSpec(old, spec) {
  const replacement = createPartFromSpec(spec);
  replacement.position.copy(old.position);
  replacement.quaternion.copy(old.quaternion);
  replacement.userData.id = old.userData.id;
  replacement.userData.role = old.userData.role;
  replacement.userData.assemblyId = old.userData.assemblyId;
  replacement.userData.creationSpec.role = old.userData.role;
  replacement.userData.creationSpec.assemblyId = old.userData.assemblyId;
  replacement.name = old.userData.role ? `${old.userData.role.replaceAll('-', ' ')} · ${replacement.userData.definition.label}` : replacement.userData.definition.label;
  const wasSelected = selectedParts.has(old);
  workspace.add(replacement);
  workspace.remove(old);
  disposeObject(old);
  if (wasSelected) {
    selectedParts.delete(old);
    selectedParts.add(replacement);
    if (selected === old) selected = replacement;
  }
  replacement.updateMatrixWorld(true);
  return replacement;
}

function replaceSelectedWithSpec(spec) {
  if (selectedParts.size !== 1 || !selected) return null;
  const replacement = replacePartWithSpec(selected, spec);
  selected = replacement;
  refreshSelectionState();
  return replacement;
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
  const additive = multiSelectMode || event.shiftKey || event.ctrlKey || event.metaKey;
  if (hits.length) select(hits[0].object.userData.root, { additive, toggle: additive });
  else if (!additive) setSelection([]);
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
    camera.position.copy(target.clone().add(new THREE.Vector3(0, 0, 140)));
  } else {
    camera.up.set(0, 0, 1);
    if (kind === 'front') camera.position.copy(target.clone().add(new THREE.Vector3(0, -140, 0)));
    if (kind === 'iso') camera.position.copy(target.clone().add(new THREE.Vector3(95, -95, 75)));
  }
  orbit.update();
}

function frameAll() {
  if (!workspace.children.length) return;
  const bounds = new THREE.Box3().setFromObject(workspace);
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(45, bounds.getSize(new THREE.Vector3()).length() * 0.85);
  orbit.target.copy(center);
  camera.up.set(0, 0, 1);
  camera.position.copy(center.clone().add(new THREE.Vector3(distance, -distance, distance * 0.72)));
  orbit.update();
}

function fillSelect(selectElement, options, valueKey = 'id', labelKey = 'label') {
  selectElement.innerHTML = '';
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option[valueKey];
    el.textContent = option[labelKey];
    selectElement.append(el);
  }
}

// Material & component library
const familySelect = document.getElementById('materialFamily');
const itemSelect = document.getElementById('materialItem');
const stockLengthSelect = document.getElementById('stockLength');
const cutLengthInput = document.getElementById('cutLength');
const thicknessSelect = document.getElementById('sheetThickness');
const sheetCutLength = document.getElementById('sheetCutLength');
const sheetCutWidth = document.getElementById('sheetCutWidth');
const lumberOptions = document.getElementById('lumberOptions');
const sheetOptions = document.getElementById('sheetOptions');
const materialPreview = document.getElementById('materialPreview');

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
  sheetCutLength.value = '96';
  sheetCutWidth.value = '48';
}

function currentStockSpec() {
  if (familySelect.value === 'sheet') return { kind: 'construction', family: 'sheet', itemId: itemSelect.value, thickness: Number(thicknessSelect.value), cutLength: Number(sheetCutLength.value) || 96, cutWidth: Number(sheetCutWidth.value) || 48, operations: [] };
  const stockLength = Number(stockLengthSelect.value);
  const requested = Number(cutLengthInput.value);
  const cutLength = Number.isFinite(requested) && requested > 0 ? Math.min(requested, stockLength) : stockLength;
  return { kind: 'construction', family: 'lumber', itemId: itemSelect.value, stockLength, cutLength, operations: [] };
}

function refreshMaterialPreview() {
  const family = familySelect.value;
  if (family === 'masonry' || family === 'smoker') {
    const part = BASE_PARTS[itemSelect.value];
    materialPreview.textContent = `${part.label} · ${part.dims.map(formatInches).join(' × ')} · component geometry is placed at real model size.`;
    return;
  }
  const definition = resolveStockPart(currentStockSpec());
  const [a, b, c] = definition.dims;
  let text = `${definition.label} · actual model ${formatInches(a)} × ${formatInches(b)} × ${formatInches(c)}`;
  if (definition.family === 'lumber') text += ` · linear offcut ${formatInches(Math.max(0, definition.stockLength - definition.cutLength))}`;
  else {
    const used = definition.cutLength * definition.cutWidth;
    const stock = definition.stockLength * definition.stockWidth;
    text += ` · ${Math.round((used / stock) * 100)}% of stock sheet area before kerf`;
  }
  materialPreview.textContent = text;
}

function syncMaterialPanel() {
  const family = familySelect.value;
  if (family === 'lumber' || family === 'sheet') fillSelect(itemSelect, getItemsForFamily(family));
  else fillSelect(itemSelect, COMPONENT_LIBRARY[family]);
  lumberOptions.hidden = family !== 'lumber';
  sheetOptions.hidden = family !== 'sheet';
  if (family === 'lumber') syncLengthOptions();
  else if (family === 'sheet') syncThicknessOptions();
  refreshMaterialPreview();
}

familySelect.addEventListener('change', syncMaterialPanel);
itemSelect.addEventListener('change', () => {
  if (familySelect.value === 'lumber') syncLengthOptions();
  else if (familySelect.value === 'sheet') syncThicknessOptions();
  refreshMaterialPreview();
});
stockLengthSelect.addEventListener('change', () => { cutLengthInput.value = stockLengthSelect.value; refreshMaterialPreview(); });
for (const input of [cutLengthInput, thicknessSelect, sheetCutLength, sheetCutWidth]) {
  input.addEventListener('input', refreshMaterialPreview);
  input.addEventListener('change', refreshMaterialPreview);
}
document.getElementById('addMaterial').addEventListener('click', () => {
  const family = familySelect.value;
  if (family === 'lumber' || family === 'sheet') addStockPart(currentStockSpec());
  else addBasePart(itemSelect.value);
});
syncMaterialPanel();

// Cut / shape editor
const cutSelectionInfo = document.getElementById('cutSelectionInfo');
const editCutLength = document.getElementById('editCutLength');
const editCutWidth = document.getElementById('editCutWidth');
const editWidthLabel = document.getElementById('editWidthLabel');
const startMiter = document.getElementById('startMiter');
const startBevel = document.getElementById('startBevel');
const endMiter = document.getElementById('endMiter');
const endBevel = document.getElementById('endBevel');
const notchFace = document.getElementById('notchFace');
const notchStart = document.getElementById('notchStart');
const notchLength = document.getElementById('notchLength');
const notchOffset = document.getElementById('notchOffset');
const notchSpan = document.getElementById('notchSpan');
const notchDepth = document.getElementById('notchDepth');
const cutOperations = document.getElementById('cutOperations');

function currentEditedDefinition() { return selectedParts.size === 1 && isEditableStock() ? selected.userData.definition : null; }
function syncNotchDefaults() {
  const definition = currentEditedDefinition();
  if (!definition) return;
  const [, width, thickness] = definition.dims;
  const topBottom = notchFace.value === 'top' || notchFace.value === 'bottom';
  notchSpan.value = String(topBottom ? width : thickness);
  notchDepth.value = String((topBottom ? thickness : width) / 2);
}

function renderCutOperations() {
  cutOperations.innerHTML = '';
  if (resetAllCutsRequested) {
    const row = document.createElement('div');
    row.className = 'operation-item';
    row.textContent = 'All previous cut operations will be removed when you apply changes.';
    cutOperations.append(row);
  }
  const angleBits = [];
  if (Number(startMiter.value) || Number(startBevel.value)) angleBits.push(`End A — miter ${startMiter.value || 0}°, bevel ${startBevel.value || 0}°`);
  if (Number(endMiter.value) || Number(endBevel.value)) angleBits.push(`End B — miter ${endMiter.value || 0}°, bevel ${endBevel.value || 0}°`);
  for (const text of angleBits) {
    const row = document.createElement('div'); row.className = 'operation-item'; row.textContent = text; cutOperations.append(row);
  }
  draftNotches.forEach((notch, index) => {
    const row = document.createElement('div'); row.className = 'operation-item';
    const text = document.createElement('span'); text.textContent = `Notch ${index + 1}: ${notch.face}, ${notch.length} in long × ${notch.span} in across × ${notch.depth} in deep`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.addEventListener('click', () => { draftNotches.splice(index, 1); renderCutOperations(); });
    row.append(text, remove); cutOperations.append(row);
  });
  if (!resetAllCutsRequested && selectedParts.size === 1 && isEditableStock()) {
    const trimCount = summarizeOperations(selected.userData.creationSpec.operations || []).trimPlanes.length;
    if (trimCount) {
      const row = document.createElement('div'); row.className = 'operation-item';
      row.textContent = `${trimCount} Trim-to-Plane operation${trimCount === 1 ? '' : 's'} retained. Use “Reset all cuts” to remove them.`;
      cutOperations.append(row);
    }
  }
}

function syncCutPanelFromSelection() {
  const editable = selectedParts.size === 1 && isEditableStock();
  document.getElementById('applyCuts').disabled = !editable;
  document.getElementById('addNotch').disabled = !editable;
  resetAllCutsRequested = false;
  if (!editable) {
    cutSelectionInfo.textContent = selectedParts.size > 1 ? 'Cut / Shape works on one stock piece at a time. Use Trim to Plane for a shared cut across several pieces.' : (selected ? 'This component is not stock lumber/sheet material.' : 'Select one lumber or sheet piece first.');
    draftNotches = [];
    cutOperations.innerHTML = '';
    return;
  }
  const definition = selected.userData.definition;
  const spec = selected.userData.creationSpec;
  const summary = summarizeOperations(spec.operations || []);
  editCutLength.value = String(definition.cutLength);
  editCutWidth.value = String(definition.family === 'sheet' ? definition.cutWidth : definition.dims[1]);
  editCutWidth.disabled = definition.family !== 'sheet';
  editWidthLabel.firstChild.textContent = definition.family === 'sheet' ? 'Width (inches)\n          ' : 'Actual board width (fixed)\n          ';
  startMiter.value = String(summary.startMiter); startBevel.value = String(summary.startBevel); endMiter.value = String(summary.endMiter); endBevel.value = String(summary.endBevel);
  draftNotches = structuredClone(summary.notches);
  cutSelectionInfo.textContent = `${selected.name} · source stock retained as ${definition.family === 'sheet' ? '96 × 48 in sheet' : formatInches(definition.stockLength)}`;
  syncNotchDefaults(); renderCutOperations();
}

for (const input of [startMiter, startBevel, endMiter, endBevel]) input.addEventListener('input', renderCutOperations);
notchFace.addEventListener('change', syncNotchDefaults);
document.getElementById('addNotch').addEventListener('click', () => {
  if (selectedParts.size !== 1 || !isEditableStock()) return;
  const definition = currentEditedDefinition();
  const length = definition.cutLength;
  const start = Math.max(0, Math.min(Number(notchStart.value) || 0, length));
  const available = Math.max(0.125, length - start);
  draftNotches.push({ type: 'notch', face: notchFace.value, start, length: Math.min(Math.max(0.125, Number(notchLength.value) || 1), available), offset: Math.max(0, Number(notchOffset.value) || 0), span: Math.max(0.125, Number(notchSpan.value) || 0.125), depth: Math.max(0.125, Number(notchDepth.value) || 0.125) });
  renderCutOperations();
});
document.getElementById('clearCuts').addEventListener('click', () => {
  startMiter.value = '0'; startBevel.value = '0'; endMiter.value = '0'; endBevel.value = '0'; draftNotches = []; resetAllCutsRequested = true; renderCutOperations();
});
document.getElementById('applyCuts').addEventListener('click', () => {
  if (selectedParts.size !== 1 || !isEditableStock()) return;
  const spec = structuredClone(selected.userData.creationSpec);
  const definition = selected.userData.definition;
  if (definition.family === 'sheet') {
    spec.cutLength = Math.max(0.125, Math.min(Number(editCutLength.value) || definition.cutLength, definition.stockLength));
    spec.cutWidth = Math.max(0.125, Math.min(Number(editCutWidth.value) || definition.cutWidth, definition.stockWidth));
  } else spec.cutLength = Math.max(0.125, Math.min(Number(editCutLength.value) || definition.cutLength, definition.stockLength));
  let operations = resetAllCutsRequested ? [] : (spec.operations || []).filter(operation => operation.type !== 'endCut' && operation.type !== 'notch');
  operations = replaceEndCut(operations, 'A', startMiter.value, startBevel.value);
  operations = replaceEndCut(operations, 'B', endMiter.value, endBevel.value);
  operations.push(...structuredClone(draftNotches));
  spec.operations = operations;
  replaceSelectedWithSpec(spec);
});

// Multi-select Trim to Plane
const trimX1 = document.getElementById('trimX1');
const trimZ1 = document.getElementById('trimZ1');
const trimX2 = document.getElementById('trimX2');
const trimZ2 = document.getElementById('trimZ2');
const trimKeep = document.getElementById('trimKeep');
const trimSelectionInfo = document.getElementById('trimSelectionInfo');
const trimPreviewStatus = document.getElementById('trimPreviewStatus');

function selectionBounds(parts = selectedStockParts()) {
  if (!parts.length) return null;
  const bounds = new THREE.Box3();
  for (const part of parts) { part.updateMatrixWorld(true); bounds.union(new THREE.Box3().setFromObject(part)); }
  return bounds;
}

function normalizedTrimPoints() {
  let p1 = { x: Number(trimX1.value), z: Number(trimZ1.value) };
  let p2 = { x: Number(trimX2.value), z: Number(trimZ2.value) };
  if (![p1.x, p1.z, p2.x, p2.z].every(Number.isFinite)) return null;
  if (p2.x < p1.x) [p1, p2] = [p2, p1];
  if (Math.abs(p2.x - p1.x) < 0.001) return null;
  return { p1, p2 };
}

function worldTrimPlane() {
  const points = normalizedTrimPoints();
  if (!points) return null;
  const { p1, p2 } = points;
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const normal = new THREE.Vector3(-dz, 0, dx).normalize();
  const point = new THREE.Vector3(p1.x, 0, p1.z);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  return { plane, keepSign: trimKeep.value === 'above' ? 1 : -1, p1, p2 };
}

function removeTrimPreview() {
  if (!trimPreview) return;
  scene.remove(trimPreview);
  trimPreview.traverse(child => { child.geometry?.dispose?.(); child.material?.dispose?.(); });
  trimPreview = null;
}

function updateTrimPreview() {
  removeTrimPreview();
  if (document.getElementById('trimPanel').classList.contains('hidden')) return;
  const trim = worldTrimPlane();
  const bounds = selectionBounds();
  if (!trim || !bounds) { trimPreviewStatus.textContent = 'Choose two different X positions and select at least one stock piece.'; return; }
  const yPad = Math.max(18, (bounds.max.y - bounds.min.y) * 0.35 + 8);
  const y0 = bounds.min.y - yPad;
  const y1 = bounds.max.y + yPad;
  const positions = [trim.p1.x,y0,trim.p1.z, trim.p1.x,y1,trim.p1.z, trim.p2.x,y0,trim.p2.z, trim.p2.x,y1,trim.p2.z];
  const planeGeometry = new THREE.BufferGeometry();
  planeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  planeGeometry.setIndex([0,2,1,2,3,1]);
  planeGeometry.computeVertexNormals();
  const planeMesh = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ color:0x2f6fd6, transparent:true, opacity:0.16, side:THREE.DoubleSide, depthWrite:false }));
  const midY = (y0 + y1) / 2;
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(trim.p1.x,midY,trim.p1.z), new THREE.Vector3(trim.p2.x,midY,trim.p2.z)]);
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color:0x155fca }));
  trimPreview = new THREE.Group(); trimPreview.add(planeMesh, line); trimPreview.renderOrder = 998; scene.add(trimPreview);
  const slopeAngle = THREE.MathUtils.radToDeg(Math.atan2(trim.p2.z - trim.p1.z, trim.p2.x - trim.p1.x));
  trimPreviewStatus.textContent = `Preview: ${slopeAngle.toFixed(2)}° line · keeping material ${trimKeep.value} it · plane extends through Y.`;
}

function syncTrimSelectionInfo() {
  const parts = selectedStockParts();
  document.getElementById('applyTrim').disabled = parts.length === 0;
  if (!parts.length) trimSelectionInfo.textContent = selectedParts.size ? 'The current selection contains no stock lumber or sheet pieces.' : 'Select one or more lumber/sheet pieces first.';
  else trimSelectionInfo.textContent = `${parts.length} stock piece${parts.length === 1 ? '' : 's'} will be evaluated against the same plane. Non-stock components are ignored.`;
  if (!document.getElementById('trimPanel').classList.contains('hidden')) updateTrimPreview();
}

function fitTrimLineToSelection() {
  const bounds = selectionBounds();
  if (!bounds) return;
  trimX1.value = String(Number(bounds.min.x.toFixed(3)));
  trimX2.value = String(Number((Math.abs(bounds.max.x - bounds.min.x) < 0.001 ? bounds.min.x + 1 : bounds.max.x).toFixed(3)));
  trimZ1.value = String(Number(bounds.max.z.toFixed(3)));
  trimZ2.value = String(Number(bounds.max.z.toFixed(3)));
  updateTrimPreview();
}

function classifyBoundsAgainstPlane(part, plane, keepSign) {
  const box3 = new THREE.Box3().setFromObject(part);
  const values = [];
  for (const x of [box3.min.x, box3.max.x]) for (const y of [box3.min.y, box3.max.y]) for (const z of [box3.min.z, box3.max.z]) values.push(keepSign * plane.distanceToPoint(new THREE.Vector3(x,y,z)));
  const min = Math.min(...values), max = Math.max(...values);
  if (max < -0.001) return 'remove-all';
  if (min >= -0.001) return 'keep-all';
  return 'intersects';
}

for (const input of [trimX1, trimZ1, trimX2, trimZ2, trimKeep]) { input.addEventListener('input', updateTrimPreview); input.addEventListener('change', updateTrimPreview); }
document.getElementById('trimFromSelection').addEventListener('click', fitTrimLineToSelection);
document.getElementById('frontViewFromTrim').addEventListener('click', () => setView('front'));
document.getElementById('applyTrim').addEventListener('click', () => {
  const trim = worldTrimPlane();
  const parts = selectedStockParts();
  if (!trim || !parts.length) return;
  const nextSelection = [];
  let trimmedCount = 0, untouchedCount = 0, skippedCount = 0;
  for (const part of selectedArray()) {
    if (!isEditableStock(part)) { nextSelection.push(part); continue; }
    part.updateMatrixWorld(true);
    const classification = classifyBoundsAgainstPlane(part, trim.plane, trim.keepSign);
    if (classification === 'remove-all') { skippedCount += 1; nextSelection.push(part); continue; }
    if (classification === 'keep-all') { untouchedCount += 1; nextSelection.push(part); continue; }
    const localPlane = trim.plane.clone().applyMatrix4(part.matrixWorld.clone().invert());
    const spec = structuredClone(part.userData.creationSpec);
    spec.operations = [...(spec.operations || []), { type:'trimPlane', normal:localPlane.normal.toArray(), constant:localPlane.constant, keepSign:trim.keepSign, sourceLine:{ x1:trim.p1.x, z1:trim.p1.z, x2:trim.p2.x, z2:trim.p2.z, keep:trimKeep.value } }];
    nextSelection.push(replacePartWithSpec(part, spec));
    trimmedCount += 1;
  }
  setSelection(nextSelection, nextSelection.at(-1));
  trimPreviewStatus.textContent = `Trim complete: ${trimmedCount} cut, ${untouchedCount} already on kept side, ${skippedCount} skipped because the plane would remove the entire piece.`;
  updateTrimPreview();
});

// Wall framing
const openingType = document.getElementById('openingType');
const openingOptions = document.getElementById('openingOptions');
const sillHeightLabel = document.getElementById('sillHeightLabel');
const wallPreview = document.getElementById('wallPreview');
function wallOptionsFromUi() {
  const type = openingType.value;
  return { length:Number(document.getElementById('wallLength').value), leftHeight:Number(document.getElementById('wallLeftHeight').value), rightHeight:Number(document.getElementById('wallRightHeight').value), spacing:Number(document.getElementById('wallSpacing').value), studItemId:document.getElementById('wallStudSize').value, doubleTop:document.getElementById('wallDoubleTop').checked, leftCorner:document.getElementById('wallLeftCorner').checked, rightCorner:document.getElementById('wallRightCorner').checked, opening:type === 'none' ? null : { type, offset:Number(document.getElementById('openingOffset').value), width:Number(document.getElementById('openingWidth').value), height:Number(document.getElementById('openingHeight').value), sillHeight:Number(document.getElementById('openingSillHeight').value), headerItemId:document.getElementById('openingHeader').value } };
}
function refreshWallPreview() {
  const plan = createWallPlan(wallOptionsFromUi());
  const roles = new Map();
  for (const piece of plan.pieces) roles.set(piece.role, (roles.get(piece.role) || 0) + 1);
  const slope = plan.rightHeight - plan.leftHeight;
  wallPreview.textContent = `${plan.pieces.length} individual pieces · ${plan.spacing} in O.C. · ${slope === 0 ? 'level top' : `top changes ${slope.toFixed(2)} in across wall`} · ${[...roles.entries()].map(([role,count]) => `${count} ${role.replaceAll('-', ' ')}`).join(', ')}`;
}
openingType.addEventListener('change', () => { openingOptions.hidden = openingType.value === 'none'; sillHeightLabel.hidden = openingType.value !== 'window'; refreshWallPreview(); });
document.querySelectorAll('#wallPanel input, #wallPanel select').forEach(control => { control.addEventListener('input', refreshWallPreview); control.addEventListener('change', refreshWallPreview); });
refreshWallPreview();
document.getElementById('generateWall').addEventListener('click', () => {
  const plan = createWallPlan(wallOptionsFromUi());
  setSelection([]);
  const created = [];
  for (const piece of plan.pieces) {
    const spec = { ...piece.spec, role:piece.role, assemblyId:plan.assemblyId };
    created.push(addObject(createPartFromSpec(spec), { position:piece.position, rotation:piece.rotation, role:piece.role, assemblyId:plan.assemblyId, select:false }));
  }
  setSelection(created, created.at(-1));
  frameAll();
  closePanel('wallPanel');
});

// Project object browser
const objectSearch = document.getElementById('objectSearch');
const projectObjectList = document.getElementById('projectObjectList');
function objectMeta(object) {
  const spec = object.userData.creationSpec || {};
  const role = object.userData.role ? object.userData.role.replaceAll('-', ' ') : null;
  const family = spec.kind === 'construction' ? (spec.family === 'lumber' ? 'Lumber' : 'Sheet good') : (BASE_PARTS[spec.type]?.family === 'masonry' ? 'Masonry' : 'Component');
  const assembly = object.userData.assemblyId ? `Wall assembly ${String(object.userData.assemblyId).slice(0,8)}` : null;
  return [family, role, assembly].filter(Boolean).join(' · ');
}
function refreshProjectObjectList() {
  if (!projectObjectList) return;
  const query = objectSearch.value.trim().toLowerCase();
  const objects = [...workspace.children].filter(object => !query || `${object.name} ${objectMeta(object)}`.toLowerCase().includes(query));
  document.getElementById('objectCount').textContent = String(workspace.children.length);
  projectObjectList.innerHTML = '';
  if (!objects.length) {
    const empty = document.createElement('div'); empty.className = 'object-empty'; empty.textContent = workspace.children.length ? 'No objects match this search.' : 'No objects in the project yet. Use Add → Material & component library or Build → Frame a wall.'; projectObjectList.append(empty); return;
  }
  for (const object of objects) {
    const row = document.createElement('div'); row.className = `object-row${selectedParts.has(object) ? ' selected' : ''}`;
    const main = document.createElement('div'); main.className = 'object-main';
    const name = document.createElement('span'); name.className = 'object-name'; name.textContent = object.name;
    const meta = document.createElement('span'); meta.className = 'object-meta'; meta.textContent = objectMeta(object); main.append(name,meta);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = selectedParts.has(object) ? (multiSelectMode ? 'Remove' : 'Selected') : (multiSelectMode ? 'Add' : 'Select'); button.disabled = selectedParts.has(object) && !multiSelectMode; button.addEventListener('click', () => select(object,{ additive:multiSelectMode, toggle:multiSelectMode }));
    row.append(main,button); projectObjectList.append(row);
  }
}
objectSearch.addEventListener('input', refreshProjectObjectList);

// Panels / menus / commands
const allPanels = ['materialsPanel','cutPanel','trimPanel','wallPanel','objectsPanel','settingsPanel'];
function closePanel(id) { document.getElementById(id).classList.add('hidden'); if (id === 'trimPanel') removeTrimPreview(); }
function togglePanel(id) {
  const panel = document.getElementById(id);
  const willOpen = panel.classList.contains('hidden');
  for (const panelId of allPanels) closePanel(panelId);
  if (willOpen) {
    panel.classList.remove('hidden');
    if (id === 'trimPanel') { syncTrimSelectionInfo(); if (!normalizedTrimPoints()) fitTrimLineToSelection(); else updateTrimPreview(); }
    if (id === 'objectsPanel') refreshProjectObjectList();
  }
}
function closeMenus() { document.querySelectorAll('.app-menu[open]').forEach(menu => menu.removeAttribute('open')); }
document.querySelectorAll('.menu-popover button').forEach(button => button.addEventListener('click', closeMenus));
document.getElementById('materialsButton').addEventListener('click', () => togglePanel('materialsPanel'));
document.getElementById('cutButton').addEventListener('click', () => { syncCutPanelFromSelection(); togglePanel('cutPanel'); });
document.getElementById('trimButton').addEventListener('click', () => { fitTrimLineToSelection(); togglePanel('trimPanel'); });
document.getElementById('wallButton').addEventListener('click', () => togglePanel('wallPanel'));
document.getElementById('objectsButton').addEventListener('click', () => togglePanel('objectsPanel'));
document.getElementById('settingsButton').addEventListener('click', () => togglePanel('settingsPanel'));
for (const [buttonId,panelId] of [['closeMaterials','materialsPanel'],['closeCut','cutPanel'],['closeTrim','trimPanel'],['closeWall','wallPanel'],['closeObjects','objectsPanel'],['closeSettings','settingsPanel']]) document.getElementById(buttonId).addEventListener('click', () => closePanel(panelId));
document.getElementById('multiSelectMode').addEventListener('click', event => { multiSelectMode = !multiSelectMode; event.currentTarget.textContent = `Multi-select: ${multiSelectMode ? 'On' : 'Off'}`; event.currentTarget.classList.toggle('active', multiSelectMode); refreshProjectObjectList(); });
document.getElementById('clearSelectionButton').addEventListener('click', () => setSelection([]));
document.getElementById('clearSelectionMenu').addEventListener('click', () => setSelection([]));
document.getElementById('duplicate').addEventListener('click', duplicateSelection);
document.getElementById('deletePart').addEventListener('click', removeSelection);
document.getElementById('clearProject').addEventListener('click', () => {
  if (!workspace.children.length) return;
  if (!window.confirm('Clear every object from this project? This cannot be undone yet.')) return;
  const objects = [...workspace.children]; setSelection([]); for (const object of objects) { workspace.remove(object); disposeObject(object); } refreshProjectObjectList();
});
document.getElementById('moveMode').addEventListener('click', () => setMode('translate'));
document.getElementById('rotateMode').addEventListener('click', () => setMode('rotate'));
document.getElementById('topView').addEventListener('click', () => setView('top'));
document.getElementById('frontView').addEventListener('click', () => setView('front'));
document.getElementById('isoView').addEventListener('click', () => setView('iso'));
document.getElementById('frameAll').addEventListener('click', frameAll);
document.getElementById('translationSnap').addEventListener('change', event => transform.setTranslationSnap(event.target.checked ? 0.5 : null));
document.getElementById('rotationSnap').addEventListener('change', event => transform.setRotationSnap(THREE.MathUtils.degToRad(Number(event.target.value) || 15)));
document.addEventListener('pointerdown', event => { if (!event.target.closest('.app-menu')) closeMenus(); });

// Collision-constrained transforms
transform.addEventListener('mouseDown', () => { if (selectedParts.size === 1 && selected) lastValidTransform = snapshotTransform(selected); });
transform.addEventListener('objectChange', () => {
  if (!selected || selectedParts.size !== 1 || validatingTransform) return;
  validatingTransform = true;
  const collisionEnabled = document.getElementById('collisionEnabled').checked;
  const target = snapshotTransform(selected);
  if (collisionEnabled && lastValidTransform) {
    const allowed = applySweptTransform(selected,lastValidTransform,target,workspace.children,{ ground:document.getElementById('groundCollision').checked, translationStep:0.25, rotationStepDeg:2 });
    if (allowed) lastValidTransform = snapshotTransform(selected);
  } else lastValidTransform = target;
  for (const helper of selectionOutlines.values()) helper.update?.();
  updateSelectionInfo();
  validatingTransform = false;
});

setSelection([]);
refreshProjectObjectList();

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1,Math.floor(rect.width));
  const height = Math.max(1,Math.floor(rect.height));
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
function loop() {
  resize();
  for (const helper of selectionOutlines.values()) helper.update?.();
  orbit.update();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
loop();
