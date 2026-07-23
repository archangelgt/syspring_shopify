/**
 * SYSPRICING Discount Function — tag = Price List
 *
 * Input variables $tags come from discount metafield syspricing.function-config
 *   { "tags": ["DPAÑUELOS", "MPAÑUELOS", ...], "priority": { "DPAÑUELOS": 10 } }
 *
 * Variant metafield syspricing.prices: { "DPAÑUELOS": "335.00", ... }
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
 *       cost: { amountPerQuantity: { amount: string } };
 *       merchandise: { metafield?: { value?: string } };
 *     }>;
 *   };
 *   discount?: { metafield?: { value?: string } };
 * }} input
 */
export function run(input) {
  const config = parseConfig(input?.discount?.metafield?.value);
  const matchedTags = (input?.cart?.buyerIdentity?.customer?.hasTags || [])
    .filter((t) => t.hasTag)
    .map((t) => String(t.tag).trim())
    .sort((a, b) => (config.priority[b] || 0) - (config.priority[a] || 0));

  if (!matchedTags.length) {
    return { operations: [] };
  }

  /** @type {Array<object>} */
  const candidates = [];

  for (const line of input.cart.lines || []) {
    const raw = line.merchandise?.metafield?.value;
    if (!raw) continue;

    let prices;
    try {
      prices = JSON.parse(raw);
    } catch {
      continue;
    }

    let target = null;
    for (const tag of matchedTags) {
      const v = Number(prices[tag]);
      if (Number.isFinite(v)) {
        target = v;
        break;
      }
    }
    if (target == null) continue;

    const catalog = Number(line.cost?.amountPerQuantity?.amount);
    if (!Number.isFinite(catalog) || target >= catalog) continue;

    candidates.push({
      message: 'SYSPRICING B2B price',
      targets: [{ cartLine: { id: line.id } }],
      value: { fixedAmount: { amount: (catalog - target).toFixed(2) } },
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

function parseConfig(raw) {
  /** @type {{ tags: string[]; priority: Record<string, number> }} */
  const out = { tags: [], priority: {} };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    out.tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    out.priority = parsed.priority && typeof parsed.priority === 'object' ? parsed.priority : {};
  } catch {
    /* ignore */
  }
  return out;
}
