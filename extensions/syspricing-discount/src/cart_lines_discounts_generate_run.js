/**
 * SYSPRICING Discount Function — customer tag = Price List.
 *
 * Input variable $tags comes from discount metafield syspricing.function-config
 *   { "tags": ["distribuidor", ...], "priority": { "distribuidor": 10 } }
 *
 * Variant metafield syspricing.prices: { "distribuidor": "310.00", ... }
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
  const hasProduct = classes.includes('PRODUCT') || classes.includes('Product');
  if (!hasProduct) {
    return { operations: [] };
  }

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
    if (line.merchandise?.__typename && line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }
    const raw = line.merchandise?.metafield?.value;
    if (!raw) continue;

    let prices;
    try {
      prices = JSON.parse(raw);
    } catch {
      continue;
    }

    let target = null;
    let matchedTag = null;
    for (const tag of matchedTags) {
      const v = Number(prices[tag]);
      if (Number.isFinite(v)) {
        target = v;
        matchedTag = tag;
        break;
      }
    }
    if (target == null) continue;

    const catalog = Number(line.cost?.amountPerQuantity?.amount);
    if (!Number.isFinite(catalog) || target >= catalog) continue;

    const perUnit = catalog - target;
    candidates.push({
      message: matchedTag ? `SYSPRICING ${matchedTag}` : 'SYSPRICING B2B',
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

function parseConfig(raw) {
  /** @type {{ tags: string[]; priority: Record<string, number> }} */
  const out = { tags: [], priority: {} };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    out.tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    out.priority =
      parsed.priority && typeof parsed.priority === 'object' ? parsed.priority : {};
  } catch {
    /* ignore */
  }
  return out;
}
