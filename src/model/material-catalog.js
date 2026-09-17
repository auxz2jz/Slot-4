export const STOCK_LENGTHS = [
  { value: 96, label: '8 ft (96 in)' },
  { value: 120, label: '10 ft (120 in)' },
  { value: 144, label: '12 ft (144 in)' },
  { value: 168, label: '14 ft (168 in)' },
  { value: 192, label: '16 ft (192 in)' },
];

const STUD_8_FT = { value: 92.625, label: 'Precut 8-ft stud (92 5/8 in)' };
const STUD_9_FT = { value: 104.625, label: 'Precut 9-ft stud (104 5/8 in)' };

export const LUMBER = [
  { id: '1x2', label: '1 × 2', actual: [0.75, 1.5], lengths: STOCK_LENGTHS },
  { id: '1x3', label: '1 × 3', actual: [0.75, 2.5], lengths: STOCK_LENGTHS },
  { id: '1x4', label: '1 × 4', actual: [0.75, 3.5], lengths: STOCK_LENGTHS },
  { id: '1x6', label: '1 × 6', actual: [0.75, 5.5], lengths: STOCK_LENGTHS },
  { id: '1x8', label: '1 × 8', actual: [0.75, 7.25], lengths: STOCK_LENGTHS },
  { id: '1x10', label: '1 × 10', actual: [0.75, 9.25], lengths: STOCK_LENGTHS },
  { id: '1x12', label: '1 × 12', actual: [0.75, 11.25], lengths: STOCK_LENGTHS },
  { id: '2x2', label: '2 × 2', actual: [1.5, 1.5], lengths: STOCK_LENGTHS },
  { id: '2x3', label: '2 × 3', actual: [1.5, 2.5], lengths: STOCK_LENGTHS },
  { id: '2x4', label: '2 × 4', actual: [1.5, 3.5], lengths: [STUD_8_FT, STUD_9_FT, ...STOCK_LENGTHS] },
  { id: '2x6', label: '2 × 6', actual: [1.5, 5.5], lengths: [STUD_8_FT, STUD_9_FT, ...STOCK_LENGTHS] },
  { id: '2x8', label: '2 × 8', actual: [1.5, 7.25], lengths: STOCK_LENGTHS },
  { id: '2x10', label: '2 × 10', actual: [1.5, 9.25], lengths: STOCK_LENGTHS },
  { id: '2x12', label: '2 × 12', actual: [1.5, 11.25], lengths: STOCK_LENGTHS },
  { id: '4x4', label: '4 × 4', actual: [3.5, 3.5], lengths: STOCK_LENGTHS },
  { id: '4x6', label: '4 × 6', actual: [3.5, 5.5], lengths: STOCK_LENGTHS },
  { id: '6x6', label: '6 × 6', actual: [5.5, 5.5], lengths: STOCK_LENGTHS },
];

export const SHEET_GOODS = [
  { id: 'plywood', label: 'Plywood', size: [96, 48], thicknesses: [0.25, 0.375, 0.5, 0.625, 0.75] },
  { id: 'osb', label: 'OSB', size: [96, 48], thicknesses: [0.4375, 0.5, 0.59375, 0.625, 0.75] },
  { id: 'mdf', label: 'MDF', size: [96, 48], thicknesses: [0.25, 0.5, 0.75] },
  { id: 'particleboard', label: 'Particleboard', size: [96, 48], thicknesses: [0.5, 0.625, 0.75] },
  { id: 'drywall', label: 'Drywall', size: [96, 48], thicknesses: [0.25, 0.375, 0.5, 0.625] },
  { id: 'cement-board', label: 'Cement backer board', size: [96, 48], thicknesses: [0.25, 0.5] },
  { id: 'foam-board', label: 'Rigid foam board', size: [96, 48], thicknesses: [0.5, 1, 1.5, 2] },
];

export const MATERIAL_FAMILIES = [
  { id: 'lumber', label: 'Dimensional lumber' },
  { id: 'sheet', label: '4 × 8 sheet goods' },
];

export function getItemsForFamily(family) {
  return family === 'sheet' ? SHEET_GOODS : LUMBER;
}

export function getLumber(id) {
  return LUMBER.find(item => item.id === id) || LUMBER.find(item => item.id === '2x4');
}

export function getSheet(id) {
  return SHEET_GOODS.find(item => item.id === id) || SHEET_GOODS[0];
}

export function formatInches(value) {
  const fractions = [
    [0.125, '1/8'], [0.25, '1/4'], [0.375, '3/8'], [0.4375, '7/16'],
    [0.5, '1/2'], [0.59375, '19/32'], [0.625, '5/8'], [0.75, '3/4'],
  ];
  const whole = Math.floor(value);
  const fraction = value - whole;
  const match = fractions.find(([decimal]) => Math.abs(decimal - fraction) < 0.0001);
  if (whole && match) return `${whole} ${match[1]} in`;
  if (match) return `${match[1]} in`;
  return `${Number(value.toFixed(3))} in`;
}

export function resolveStockPart(spec) {
  if (spec.family === 'sheet') {
    const item = getSheet(spec.itemId);
    const thickness = Number(spec.thickness ?? item.thicknesses[0]);
    return {
      kind: 'construction',
      family: 'sheet',
      itemId: item.id,
      label: `${item.label} 4 × 8 × ${formatInches(thickness)}`,
      dims: [item.size[0], item.size[1], thickness],
      stockLength: item.size[0],
      cutLength: item.size[0],
      stockWidth: item.size[1],
      thickness,
      color: item.id === 'drywall' ? 0xe8e5dc : item.id === 'foam-board' ? 0xd9e6ef : 0xc8a978,
    };
  }

  const item = getLumber(spec.itemId);
  const stockLength = Number(spec.stockLength ?? item.lengths[0].value);
  const cutLength = Number(spec.cutLength ?? stockLength);
  const [thickness, width] = item.actual;
  return {
    kind: 'construction',
    family: 'lumber',
    itemId: item.id,
    label: `${item.label} — ${formatInches(cutLength)} long`,
    dims: [cutLength, width, thickness],
    stockLength,
    cutLength,
    nominal: item.label,
    actualCrossSection: [thickness, width],
    color: 0xc99c68,
  };
}
