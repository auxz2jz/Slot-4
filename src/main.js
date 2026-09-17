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
  cmu: { label: 'Cinder block', dims: [16, 8, 8], color: 0x9b9b9b },
  firebrick: { label: 'Firebrick', dims: [9, 4.5, 2.5], color: 0xe0ad3d },
  lid: { label: 'Smoker lid', dims: [25.5, 19.5, 5.5], color: 0x34383d },
};

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe3e8);
const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 5000);
camera.position.set(95, -125, 85);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 30);
orbit.enableDamping = true;
orbit.touches.ONE = THREE.TOUCH.ROTATE;
orbit.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb7bcc3, 3));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(70, -55, 120);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(480, 960, 0x6f7882, 0xaeb5bd);
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
let lastValidTransform = null;
let validatingTransform = false;
let draftNotches = [];

function stableId() {
  return globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${fallbackSerial++}`;
}

function edgeify(mesh, color = 0x33363a) {
  ensureBoundsTree(mesh.geometry);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color }),
  );
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
  object.rotation.set(
    THREE.MathUtils.degToRad(Number(rotation[0]) || 0),
    THREE.MathUtils.degToRad(Number(rotation[1]) || 0),
    THREE.MathUtils.degToRad(Number(rotation[2]) || 0),
  );
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
  if (options.select !== false) select(object);
  return object;
}

function addBasePart(type) {
  addObject(createPartFromSpec({ kind: 'base', type }));
}

function addStockPart(spec) {
  addObject(createPartFromSpec(spec));
}

function destroyOutline() {
  if (!selectionOutline) return;
  scene.remove(selectionOutline);
  selectionOutline.geometry?.dispose?.();
  selectionOutline.material?.dispose?.();
  selectionOutline = null;
}

function selectionText(part) {
  const p = part.position;
  const definition = part.userData.definition;
  const role = part.userData.role ? `${part.userData.role.replaceAll('-', ' ')} · ` : '';
  let extra = '';
  if (definition?.family === 'lumber') {
    const offcut = Math.max(0, definition.stockLength - definition.cutLength);
    extra = ` · Stock ${formatInches(definition.stockLength)} · Piece ${formatInches(definition.cutLength)} · Linear offcut ${formatInches(offcut)}`;
  } else if (definition?.family === 'sheet') {
    extra = ` · Stock 96 × 48 in · Piece ${formatInches(definition.cutLength)} × ${formatInches(definition.cutWidth)}`;
  }
  const opCount = part.userData.creationSpec?.operations?.length || 0;
  if (opCount) extra += ` · ${opCount} cut operation${opCount === 1 ? '' : 's'}`;
  return `${role}${part.name} · X ${p.x.toFixed(2)} Y ${p.y.toFixed(2)} Z ${p.z.toFixed(2)}${extra}`;
}

function updateSelectionInfo() {
  document.getElementById('selectionInfo').textContent = selected ? selectionText(selected) : 'Nothing selected.';
  document.getElementById('cutButton').disabled = !selected;
}

function snapshotTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
  };
}

function select(object) {
  selected = object || null;
  transform.detach();
  destroyOutline();
  if (!selected) {
    lastValidTransform = null;
    updateSelectionInfo();
    syncCutPanelFromSelection();
    return;
  }
  transform.attach(selected);
  selectionOutline = new THREE.BoxHelper(selected, 0x005ee8);
  selectionOutline.material.depthTest = false;
  selectionOutline.material.transparent = true;
  selectionOutline.material.opacity = 0.85;
  selectionOutline.renderOrder = 999;
  scene.add(selectionOutline);
  lastValidTransform = snapshotTransform(selected);
  updateSelectionInfo();
  syncCutPanelFromSelection();
}

function duplicate() {
  if (!selected) return;
  const copy = createPartFromSpec(selected.userData.creationSpec);
  copy.position.copy(selected.position).add(new THREE.Vector3(0.5, 0.5, 0.5));
  copy.quaternion.copy(selected.quaternion);
  copy.userData.role = selected.userData.role;
  copy.userData.assemblyId = selected.userData.assemblyId;
  copy.name = selected.name;
  workspace.add(copy);
  select(copy);
}

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.boundsTree?.dispose?.();
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

function replaceSelectedWithSpec(spec) {
  if (!selected) return null;
  const old = selected;
  const replacement = createPartFromSpec(spec);
  replacement.position.copy(old.position);
  replacement.quaternion.copy(old.quaternion);
  replacement.userData.id = old.userData.id;
  replacement.userData.role = old.userData.role;
  replacement.userData.assemblyId = old.userData.assemblyId;
  replacement.userData.creationSpec.role = old.userData.role;
  replacement.userData.creationSpec.assemblyId = old.userData.assemblyId;
  replacement.name = old.userData.role
    ? `${old.userData.role.replaceAll('-', ' ')} · ${replacement.userData.definition.label}`
    : replacement.userData.definition.label;
  workspace.add(replacement);
  workspace.remove(old);
  disposeObject(old);
  select(replacement);
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

// ---------------- Material library ----------------
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
  sheetCutLength.value = '96';
  sheetCutWidth.value = '48';
}

function currentStockSpec() {
  if (familySelect.value === 'sheet') {
    return {
      kind: 'construction',
      family: 'sheet',
      itemId: itemSelect.value,
      thickness: Number(thicknessSelect.value),
      cutLength: Number(sheetCutLength.value) || 96,
      cutWidth: Number(sheetCutWidth.value) || 48,
      operations: [],
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
    operations: [],
  };
}

function refreshMaterialPreview() {
  const definition = resolveStockPart(currentStockSpec());
  const [a, b, c] = definition.dims;
  let text = `${definition.label} · actual model ${formatInches(a)} × ${formatInches(b)} × ${formatInches(c)}`;
  if (definition.family === 'lumber') {
    text += ` · linear offcut ${formatInches(Math.max(0, definition.stockLength - definition.cutLength))}`;
  } else {
    const used = definition.cutLength * definition.cutWidth;
    const stock = definition.stockLength * definition.stockWidth;
    text += ` · ${Math.round((used / stock) * 100)}% of stock sheet area before kerf`;
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
for (const input of [cutLengthInput, thicknessSelect, sheetCutLength, sheetCutWidth]) {
  input.addEventListener('input', refreshMaterialPreview);
  input.addEventListener('change', refreshMaterialPreview);
}
document.getElementById('addMaterial').addEventListener('click', () => addStockPart(currentStockSpec()));
syncMaterialPanel();

// ---------------- Cut editor ----------------
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

function isEditableStock(part = selected) {
  return part?.userData?.creationSpec?.kind === 'construction';
}

function currentEditedDefinition() {
  return isEditableStock() ? selected.userData.definition : null;
}

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
  const angleBits = [];
  if (Number(startMiter.value) || Number(startBevel.value)) angleBits.push(`End A: miter ${startMiter.value || 0}°, bevel ${startBevel.value || 0}°`);
  if (Number(endMiter.value) || Number(endBevel.value)) angleBits.push(`End B: miter ${endMiter.value || 0}°, bevel ${endBevel.value || 0}°`);
  for (const text of angleBits) {
    const row = document.createElement('div');
    row.className = 'operation-item';
    row.textContent = text;
    cutOperations.append(row);
  }
  draftNotches.forEach((notch, index) => {
    const row = document.createElement('div');
    row.className = 'operation-item';
    const text = document.createElement('span');
    text.textContent = `Notch ${index + 1}: ${notch.face}, ${notch.length} in long × ${notch.span} in across × ${notch.depth} in deep`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      draftNotches.splice(index, 1);
      renderCutOperations();
    });
    row.append(text, remove);
    cutOperations.append(row);
  });
}

function syncCutPanelFromSelection() {
  const editable = isEditableStock();
  document.getElementById('applyCuts').disabled = !editable;
  document.getElementById('addNotch').disabled = !editable;
  if (!editable) {
    cutSelectionInfo.textContent = selected ? 'This component is not stock lumber/sheet material.' : 'Select lumber or sheet material first.';
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
  startMiter.value = String(summary.startMiter);
  startBevel.value = String(summary.startBevel);
  endMiter.value = String(summary.endMiter);
  endBevel.value = String(summary.endBevel);
  draftNotches = structuredClone(summary.notches);
  cutSelectionInfo.textContent = `${selected.name} · stock retained as ${definition.family === 'sheet' ? '96 × 48 in sheet' : formatInches(definition.stockLength)}`;
  syncNotchDefaults();
  renderCutOperations();
}

for (const input of [startMiter, startBevel, endMiter, endBevel]) input.addEventListener('input', renderCutOperations);
notchFace.addEventListener('change', syncNotchDefaults);

document.getElementById('addNotch').addEventListener('click', () => {
  if (!isEditableStock()) return;
  const definition = currentEditedDefinition();
  const length = definition.cutLength;
  const start = Math.max(0, Math.min(Number(notchStart.value) || 0, length));
  const available = Math.max(0.125, length - start);
  draftNotches.push({
    type: 'notch',
    face: notchFace.value,
    start,
    length: Math.min(Math.max(0.125, Number(notchLength.value) || 1), available),
    offset: Math.max(0, Number(notchOffset.value) || 0),
    span: Math.max(0.125, Number(notchSpan.value) || 0.125),
    depth: Math.max(0.125, Number(notchDepth.value) || 0.125),
  });
  renderCutOperations();
});

document.getElementById('clearCuts').addEventListener('click', () => {
  startMiter.value = '0';
  startBevel.value = '0';
  endMiter.value = '0';
  endBevel.value = '0';
  draftNotches = [];
  renderCutOperations();
});

document.getElementById('applyCuts').addEventListener('click', () => {
  if (!isEditableStock()) return;
  const spec = structuredClone(selected.userData.creationSpec);
  const definition = selected.userData.definition;
  if (definition.family === 'sheet') {
    spec.cutLength = Math.max(0.125, Math.min(Number(editCutLength.value) || definition.cutLength, definition.stockLength));
    spec.cutWidth = Math.max(0.125, Math.min(Number(editCutWidth.value) || definition.cutWidth, definition.stockWidth));
  } else {
    spec.cutLength = Math.max(0.125, Math.min(Number(editCutLength.value) || definition.cutLength, definition.stockLength));
  }
  let operations = (spec.operations || []).filter(operation => operation.type !== 'endCut' && operation.type !== 'notch');
  operations = replaceEndCut(operations, 'A', startMiter.value, startBevel.value);
  operations = replaceEndCut(operations, 'B', endMiter.value, endBevel.value);
  operations.push(...structuredClone(draftNotches));
  spec.operations = operations;
  replaceSelectedWithSpec(spec);
});

// ---------------- Wall framing ----------------
const openingType = document.getElementById('openingType');
const openingOptions = document.getElementById('openingOptions');
const sillHeightLabel = document.getElementById('sillHeightLabel');
const wallPreview = document.getElementById('wallPreview');

function wallOptionsFromUi() {
  const type = openingType.value;
  return {
    length: Number(document.getElementById('wallLength').value),
    leftHeight: Number(document.getElementById('wallLeftHeight').value),
    rightHeight: Number(document.getElementById('wallRightHeight').value),
    spacing: Number(document.getElementById('wallSpacing').value),
    studItemId: document.getElementById('wallStudSize').value,
    doubleTop: document.getElementById('wallDoubleTop').checked,
    leftCorner: document.getElementById('wallLeftCorner').checked,
    rightCorner: document.getElementById('wallRightCorner').checked,
    opening: type === 'none' ? null : {
      type,
      offset: Number(document.getElementById('openingOffset').value),
      width: Number(document.getElementById('openingWidth').value),
      height: Number(document.getElementById('openingHeight').value),
      sillHeight: Number(document.getElementById('openingSillHeight').value),
      headerItemId: document.getElementById('openingHeader').value,
    },
  };
}

function refreshWallPreview() {
  const plan = createWallPlan(wallOptionsFromUi());
  const roles = new Map();
  for (const piece of plan.pieces) roles.set(piece.role, (roles.get(piece.role) || 0) + 1);
  const slope = plan.rightHeight - plan.leftHeight;
  wallPreview.textContent = `${plan.pieces.length} individual pieces · ${plan.spacing} in O.C. · ${slope === 0 ? 'level top' : `top changes ${slope.toFixed(2)} in across wall`} · ${[...roles.entries()].map(([role, count]) => `${count} ${role.replaceAll('-', ' ')}`).join(', ')}`;
}

openingType.addEventListener('change', () => {
  openingOptions.hidden = openingType.value === 'none';
  sillHeightLabel.hidden = openingType.value !== 'window';
  refreshWallPreview();
});

document.querySelectorAll('#wallPanel input, #wallPanel select').forEach(control => {
  control.addEventListener('input', refreshWallPreview);
  control.addEventListener('change', refreshWallPreview);
});
refreshWallPreview();

document.getElementById('generateWall').addEventListener('click', () => {
  const plan = createWallPlan(wallOptionsFromUi());
  select(null);
  for (const piece of plan.pieces) {
    const spec = { ...piece.spec, role: piece.role, assemblyId: plan.assemblyId };
    const object = createPartFromSpec(spec);
    addObject(object, {
      position: piece.position,
      rotation: piece.rotation,
      role: piece.role,
      assemblyId: plan.assemblyId,
      select: false,
    });
  }
  frameAll();
  document.getElementById('wallPanel').classList.add('hidden');
});

// ---------------- Panels / controls ----------------
const leftPanels = ['materialsPanel', 'cutPanel', 'wallPanel'];
function toggleLeftPanel(id) {
  const panel = document.getElementById(id);
  const willOpen = panel.classList.contains('hidden');
  for (const panelId of leftPanels) document.getElementById(panelId).classList.add('hidden');
  if (willOpen) panel.classList.remove('hidden');
}

document.getElementById('materialsButton').addEventListener('click', () => toggleLeftPanel('materialsPanel'));
document.getElementById('cutButton').addEventListener('click', () => {
  syncCutPanelFromSelection();
  toggleLeftPanel('cutPanel');
});
document.getElementById('wallButton').addEventListener('click', () => toggleLeftPanel('wallPanel'));
document.getElementById('closeMaterials').addEventListener('click', () => document.getElementById('materialsPanel').classList.add('hidden'));
document.getElementById('closeCut').addEventListener('click', () => document.getElementById('cutPanel').classList.add('hidden'));
document.getElementById('closeWall').addEventListener('click', () => document.getElementById('wallPanel').classList.add('hidden'));

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
document.getElementById('translationSnap').addEventListener('change', event => transform.setTranslationSnap(event.target.checked ? 0.5 : null));
document.getElementById('rotationSnap').addEventListener('change', event => transform.setRotationSnap(THREE.MathUtils.degToRad(Number(event.target.value) || 15)));

// ---------------- Collision-constrained transforms ----------------
transform.addEventListener('mouseDown', () => {
  if (selected) lastValidTransform = snapshotTransform(selected);
});

transform.addEventListener('objectChange', () => {
  if (!selected || validatingTransform) return;
  validatingTransform = true;
  const collisionEnabled = document.getElementById('collisionEnabled').checked;
  const target = snapshotTransform(selected);
  if (collisionEnabled && lastValidTransform) {
    const allowed = applySweptTransform(
      selected,
      lastValidTransform,
      target,
      workspace.children,
      { ground: document.getElementById('groundCollision').checked, translationStep: 0.25, rotationStepDeg: 2 },
    );
    if (allowed) lastValidTransform = snapshotTransform(selected);
  } else {
    lastValidTransform = target;
  }
  selectionOutline?.update?.();
  updateSelectionInfo();
  validatingTransform = false;
});

// Start with a clean construction workspace. Smoker parts remain available as components.
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
  selectionOutline?.update?.();
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
