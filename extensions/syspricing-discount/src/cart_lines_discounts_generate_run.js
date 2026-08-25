/**
 * SYSPRICING Discount Function — customer tag = Price List.
 *
 * Input variable $tags comes from discount metafield syspricing.function-config
 *   { "tags": ["distribuidor", ...], "priority": { "distribuidor": 10 } }
 *
 * Variant metafield syspricing.prices: { "distribuidor": "310.00", ... }
 *
 * hasTags is case-sensitive; config tags are lowercase. We match prices
 * case-insensitively and expect $tags to include case variants.
 */

// @ts-check

/**
 * @param {{
 *   cart: {
 *     buyerIdentity?: {
 *       customer?: { hasTags?: Array<{ hasTag: boolean; tag: string }> };
 *     };
 *     lines: Array<{
 *       id: string;
 *       quantity?: number;
 *       cost: { amountPerQuantity: { amount: string } };
 *       merchandise: { __typename?: string; metafield?: { value?: string } };
 *     }>;
 *   };
 *   discount?: {
 *     discountClasses?: string[];
 *     metafield?: { value?: string };
 *   };
 * }} input
 */
export function cartLinesDiscountsGenerateRun(input) {
  const classes = input?.discount?.discountClasses || [];
  if (classes.length && !allowsProductDiscount(classes)) {
    return { operations: [] };
  }

  const config = parseConfig(input?.discount?.metafield?.value);
  const matchedTags = (input?.cart?.buyerIdentity?.customer?.hasTags || [])
    .filter((t) => t.hasTag)
    .map((t) => String(t.tag).trim())
    .filter(Boolean);

  const uniqueNorm = [];
  const seenNorm = new Set();
  for (const tag of matchedTags) {
    const n = normalizeTag(tag);
    if (!n || seenNorm.has(n)) continue;
    seenNorm.add(n);
    uniqueNorm.push(tag);
  }

  uniqueNorm.sort(
    (a, b) =>
      (priorityFor(b, config.priority) || 0) - (priorityFor(a, config.priority) || 0) ||
      normalizeTag(a).localeCompare(normalizeTag(b))
  );

  if (!uniqueNorm.length) {
    return { operations: [] };
  }

  /** @type {Array<object>} */
  const candidates = [];

  for (const line of input.cart.lines || []) {
    if (line.merchandise?.__typename && line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }
    const raw = line.merchandise?.metafield?.value;
    if (!raw) continue;

    let prices;
    try {
      prices = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (!prices || typeof prices !== 'object') continue;

    const index = pricesIndex(prices);
    let target = null;
    let matchedTag = null;
    for (const tag of uniqueNorm) {
      const hit = index.get(normalizeTag(tag));
      if (!hit) continue;
      const v = Number(hit.value);
      if (!Number.isFinite(v) || v < 0) continue;
      target = v;
      matchedTag = hit.key;
      break;
    }
    if (target == null) continue;

    const catalog = Number(line.cost?.amountPerQuantity?.amount);
    if (!Number.isFinite(catalog) || target >= catalog) continue;

    const perUnit = catalog - target;
    candidates.push({
      message: 'Precio Especial',
      targets: [{ cartLine: { id: line.id } }],
      value: {
        fixedAmount: {
          amount: perUnit.toFixed(2),
          appliesToEachItem: true,
        },
      },
    });
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: 'ALL',
        },
      },
    ],
  };
}

export function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function allowsProductDiscount(classes) {
  if (!classes || !classes.length) return true;
  return classes.some((c) => String(c).toUpperCase() === 'PRODUCT');
}

function priorityFor(tag, priorityMap) {
  if (!priorityMap || typeof priorityMap !== 'object') return 0;
  const n = normalizeTag(tag);
  if (Object.prototype.hasOwnProperty.call(priorityMap, tag)) {
    return Number(priorityMap[tag]) || 0;
  }
  for (const [k, v] of Object.entries(priorityMap)) {
    if (normalizeTag(k) === n) return Number(v) || 0;
  }
  return 0;
}

function pricesIndex(pricesMap) {
  const index = new Map();
  for (const [key, value] of Object.entries(pricesMap)) {
    const n = normalizeTag(key);
    if (!n || index.has(n)) continue;
    index.set(n, { key, value });
  }
  return index;
}

function parseConfig(raw) {
  /** @type {{ tags: string[]; priority: Record<string, number> }} */
  const out = { tags: [], priority: {} };
  if (!raw) return out;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    out.tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    out.priority =
      parsed.priority && typeof parsed.priority === 'object' ? parsed.priority : {};
  } catch {
    /* ignore */
  }
  return out;
}
