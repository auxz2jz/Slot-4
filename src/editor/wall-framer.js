import { getLumber } from '../model/material-catalog.js';

function chooseStockLength(itemId, required) {
  const item = getLumber(itemId);
  const candidates = item.lengths
    .map(option => Number(option.value))
    .filter(value => value >= required)
    .sort((a, b) => a - b);
  return candidates[0] || Math.max(required, ...item.lengths.map(option => Number(option.value)));
}

function stockSpec(itemId, cutLength, operations = []) {
  return {
    kind: 'construction',
    family: 'lumber',
    itemId,
    stockLength: chooseStockLength(itemId, cutLength),
    cutLength,
    operations,
  };
}

function part(role, spec, position, rotation = [0, 0, 0]) {
  return { role, spec, position, rotation };
}

function uniquePositions(values, tolerance = 0.01) {
  return values
    .sort((a, b) => a - b)
    .filter((value, index, array) => index === 0 || Math.abs(value - array[index - 1]) > tolerance);
}

function commonStudCenters(length, spacing, studThickness) {
  const centers = [studThickness / 2];
  for (let x = spacing; x < length - studThickness / 2; x += spacing) centers.push(x);
  centers.push(length - studThickness / 2);
  return uniquePositions(centers);
}

function slopeHeight(leftHeight, rightHeight, length, xFromLeft) {
  if (length <= 0) return leftHeight;
  return leftHeight + (rightHeight - leftHeight) * (xFromLeft / length);
}

function splitPlate(length, maxLength = 192) {
  const segments = [];
  let remaining = length;
  let cursor = 0;
  while (remaining > 0.001) {
    const segmentLength = Math.min(maxLength, remaining);
    segments.push({ start: cursor, length: segmentLength });
    cursor += segmentLength;
    remaining -= segmentLength;
  }
  return segments;
}

export function createWallPlan(options = {}) {
  const length = Math.max(12, Number(options.length) || 96);
  const leftHeight = Math.max(12, Number(options.leftHeight) || 96);
  const rightHeight = Math.max(12, Number(options.rightHeight) || leftHeight);
  const spacing = Math.max(4, Number(options.spacing) || 16);
  const studItemId = options.studItemId || '2x4';
  const stud = getLumber(studItemId);
  const studThickness = stud.actual[0];
  const wallDepth = stud.actual[1];
  const topPlateCount = options.doubleTop === false ? 1 : 2;
  const slopeAngle = Math.atan2(rightHeight - leftHeight, length) * 180 / Math.PI;
  const slopedTopLength = Math.hypot(length, rightHeight - leftHeight);
  const pieces = [];
  const assemblyId = options.assemblyId || `wall-${Date.now()}`;

  // Bottom plate(s), split at the longest catalog stock length if necessary.
  for (const segment of splitPlate(length)) {
    pieces.push(part(
      'bottom-plate',
      stockSpec(studItemId, segment.length),
      [-length / 2 + segment.start + segment.length / 2, 0, studThickness / 2],
    ));
  }

  // Sloped or level top plates. They stay individual boards for takeoff and editing.
  for (let layer = 0; layer < topPlateCount; layer += 1) {
    const normalOffset = studThickness / 2 + layer * studThickness;
    pieces.push(part(
      layer === 0 ? 'top-plate' : 'top-plate-2',
      stockSpec(studItemId, slopedTopLength),
      [0, 0, (leftHeight + rightHeight) / 2 - normalOffset],
      [0, -slopeAngle, 0],
    ));
  }

  const opening = options.opening && options.opening.type !== 'none' ? options.opening : null;
  let blockedStart = Infinity;
  let blockedEnd = -Infinity;
  if (opening) {
    const openingLeft = Math.max(studThickness * 3, Number(opening.offset) || 24);
    const openingWidth = Math.max(12, Number(opening.width) || 36);
    const openingRight = Math.min(length - studThickness * 3, openingLeft + openingWidth);
    blockedStart = openingLeft - studThickness * 2;
    blockedEnd = openingRight + studThickness * 2;
  }

  const centers = commonStudCenters(length, spacing, studThickness)
    .filter(center => center < blockedStart || center > blockedEnd);

  if (options.leftCorner !== false) {
    centers.push(studThickness * 1.5, studThickness * 2.5);
  }
  if (options.rightCorner !== false) {
    centers.push(length - studThickness * 1.5, length - studThickness * 2.5);
  }

  function addVerticalStud(role, xFromLeft, bottomZ = studThickness, topZ = null) {
    const wallTop = slopeHeight(leftHeight, rightHeight, length, xFromLeft);
    const topPlateAllowance = topPlateCount * studThickness;
    const actualTop = topZ == null ? wallTop - topPlateAllowance : topZ;
    const cutLength = Math.max(studThickness, actualTop - bottomZ);
    const operations = Math.abs(slopeAngle) > 0.001 && topZ == null
      ? [{ type: 'endCut', end: 'B', miter: 0, bevel: -slopeAngle }]
      : [];
    pieces.push(part(
      role,
      stockSpec(studItemId, cutLength, operations),
      [-length / 2 + xFromLeft, 0, bottomZ + cutLength / 2],
      [0, -90, 0],
    ));
  }

  for (const center of uniquePositions(centers)) addVerticalStud('common-stud', center);

  if (opening) {
    const openingLeft = Math.max(studThickness * 3, Number(opening.offset) || 24);
    const requestedWidth = Math.max(12, Number(opening.width) || 36);
    const openingRight = Math.min(length - studThickness * 3, openingLeft + requestedWidth);
    const openingWidth = openingRight - openingLeft;
    const roughHeight = Math.max(24, Number(opening.height) || 82.5);
    const sillHeight = opening.type === 'window' ? Math.max(studThickness * 2, Number(opening.sillHeight) || 36) : studThickness;
    const headerItemId = opening.headerItemId || '2x6';
    const header = getLumber(headerItemId);
    const headerThickness = header.actual[0];
    const headerDepth = header.actual[1];
    const headerBottom = Math.min(
      slopeHeight(leftHeight, rightHeight, length, (openingLeft + openingRight) / 2) - topPlateCount * studThickness - headerDepth,
      opening.type === 'door' ? roughHeight : sillHeight + roughHeight,
    );

    const leftJack = openingLeft - studThickness / 2;
    const rightJack = openingRight + studThickness / 2;
    const leftKing = openingLeft - studThickness * 1.5;
    const rightKing = openingRight + studThickness * 1.5;

    addVerticalStud('king-stud', leftKing);
    addVerticalStud('king-stud', rightKing);
    addVerticalStud('jack-stud', leftJack, studThickness, headerBottom);
    addVerticalStud('jack-stud', rightJack, studThickness, headerBottom);

    const headerLength = openingWidth + studThickness * 2;
    const headerCenterX = -length / 2 + (openingLeft + openingRight) / 2;
    const headerCenterZ = headerBottom + headerDepth / 2;
    const headerYOffset = Math.max(0, wallDepth / 2 - headerThickness / 2);
    pieces.push(part(
      'header',
      stockSpec(headerItemId, headerLength),
      [headerCenterX, -headerYOffset, headerCenterZ],
      [90, 0, 0],
    ));
    if (headerYOffset > 0.01) {
      pieces.push(part(
        'header',
        stockSpec(headerItemId, headerLength),
        [headerCenterX, headerYOffset, headerCenterZ],
        [90, 0, 0],
      ));
    }

    if (opening.type === 'window') {
      pieces.push(part(
        'window-sill',
        stockSpec(studItemId, openingWidth),
        [headerCenterX, 0, sillHeight],
      ));

      for (const center of commonStudCenters(length, spacing, studThickness)) {
        if (center > openingLeft && center < openingRight) {
          addVerticalStud('cripple-below', center, studThickness, sillHeight - studThickness / 2);
        }
      }
    }

    const headerTop = headerBottom + headerDepth;
    for (const center of commonStudCenters(length, spacing, studThickness)) {
      if (center > openingLeft && center < openingRight) {
        addVerticalStud('cripple-above', center, headerTop);
      }
    }
  }

  return {
    assemblyId,
    type: 'wall',
    length,
    leftHeight,
    rightHeight,
    spacing,
    studItemId,
    pieces,
  };
}
