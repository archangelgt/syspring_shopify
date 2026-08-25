'use strict';

const { groupLinesByUnitOff, MAX_COMBINABLE_CODES } = require('../src/infrastructure/shopify/nativeCheckoutDiscount');

function row(id, unitOff, qty) {
  return {
    variantGid: `gid://shopify/ProductVariant/${id}`,
    qty,
    unitOff,
    off: unitOff * qty,
  };
}

const mixed = [
  row('1', 239, 1), // BASIC 499-260
  row('2', 204, 1), // ELITE 499-295
  row('3', 224, 2), // GOLD 499-275
  row('4', 189, 3), // ELITE PLUS 499-310
  row('5', 250, 3), // WALLET 585-335
];

const groups = groupLinesByUnitOff(mixed);
if (groups.length !== 5) throw new Error('expected 5 groups, got ' + groups.length);
if (!groups.every((g) => g.appliesOnEachItem)) throw new Error('mixed SKUs must not be pooled');
const byOff = Object.fromEntries(groups.map((g) => [g.unitOff, g]));
if (byOff['239.00'].variantGids.length !== 1) throw new Error('BASIC group');
if (byOff['224.00'].lineCount !== 2) throw new Error('GOLD qty');

const same = groupLinesByUnitOff([row('1', 189, 2), row('2', 189, 1)]);
if (same.length !== 1 || same[0].unitOff !== '189.00' || same[0].variantGids.length !== 2) {
  throw new Error('same unit off should be one group');
}

const many = [];
for (let i = 1; i <= 8; i += 1) many.push(row(String(i), i * 10, 1));
const capped = groupLinesByUnitOff(many);
if (capped.length !== MAX_COMBINABLE_CODES) {
  throw new Error('expected cap ' + MAX_COMBINABLE_CODES + ', got ' + capped.length);
}
if (capped[capped.length - 1].appliesOnEachItem !== false) {
  throw new Error('overflow groups must pool only the remainder');
}

console.log('native discount grouping ok');
