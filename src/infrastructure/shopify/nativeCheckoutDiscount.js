'use strict';

const crypto = require('crypto');

/** Shopify checkout stacks at most 5 combinable discount codes. */
const MAX_COMBINABLE_CODES = 5;

/**
 * Native Shopify discount codes (not Functions). Works on non-Plus + custom apps.
 *
 * One Basic code can only carry a single amount. If we pool mixed B2B offs into
 * one code, Shopify prorates by catalog price and every Q499 item lands on the
 * same cents (e.g. Q284.12) instead of 260 / 275 / 295 / 310.
 * Group by per-unit off and issue one combinable code per group.
 */
function createNativeCheckoutDiscount({ getAdminClient, useCases }) {
  async function createForCart(shop, { customerId, tags, lines }) {
    const client = await getAdminClient(shop);
    if (!client) return { ok: false, reason: 'NO_SESSION' };

    const parsed = normalizeLines(lines);
    if (!parsed.length) return { ok: false, reason: 'NO_LINES' };

    const catalogById = await fetchCatalogPrices(client, parsed.map((l) => l.variantGid));
    let amount = 0;
    const breakdown = [];

    for (const line of parsed) {
      const catalog = Number(catalogById.get(line.numericId));
      if (!Number.isFinite(catalog) || catalog <= 0) continue;
      const resolved = useCases.resolve.run(shop, {
        tags,
        shopifyVariantId: line.variantGid,
      });
      const b2b =
        resolved.reason === 'ok' && resolved.price != null ? Number(resolved.price) : catalog;
      const unitOff = Math.max(0, roundMoney(catalog - b2b));
      if (unitOff <= 0) continue;
      const lineOff = roundMoney(unitOff * line.qty);
      amount = roundMoney(amount + lineOff);
      breakdown.push({
        variantId: line.numericId,
        variantGid: line.variantGid,
        qty: line.qty,
        catalog,
        b2b,
        unitOff,
        off: lineOff,
      });
    }

    if (amount < 0.01 || !breakdown.length) return { ok: true, skipped: true, amount: 0 };

    const groups = groupLinesByUnitOff(breakdown);
    const customerGid = toCustomerGid(customerId);
    const codes = [];
    const discountIds = [];
    let lastErrors = [];

    for (const group of groups) {
      const created = await createOneCode(client, {
        customerGid,
        variantGids: group.variantGids,
        discountAmount: group.appliesOnEachItem ? group.unitOff : group.pooledAmount.toFixed(2),
        appliesOnEachItem: group.appliesOnEachItem,
      });
      if (created.ok) {
        codes.push(created.code);
        if (created.discountId) discountIds.push(created.discountId);
      } else {
        lastErrors = created.errors || lastErrors;
      }
    }

    if (!codes.length) {
      return {
        ok: false,
        reason: 'CREATE_FAILED',
        errors: lastErrors,
        hint: lastErrors.map((e) => e.message).join('; ') || 'discountCodeBasicCreate failed',
      };
    }

    return {
      ok: true,
      code: codes[0],
      codes,
      amount,
      appliesOnEachItem: groups.length === 1 && groups[0].appliesOnEachItem,
      groups: groups.length,
      breakdown,
      discountId: discountIds[0] || null,
      discountIds,
    };
  }

  return { createForCart };
}

async function createOneCode(client, { customerGid, variantGids, discountAmount, appliesOnEachItem }) {
  const code = `SP${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const customerGets = {
    value: { discountAmount: { amount: String(discountAmount), appliesOnEachItem } },
    items: { products: { productVariantsToAdd: [...new Set(variantGids)] } },
  };
  const base = {
    title: `Precio Especial ${code}`,
    code,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: Boolean(customerGid),
    customerGets,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: true,
      shippingDiscounts: true,
    },
  };

  const attempts = [
    {
      ...base,
      context: customerGid ? { customers: { add: [customerGid] } } : { all: 'ALL' },
    },
    {
      ...base,
      customerSelection: customerGid ? { customers: { add: [customerGid] } } : { all: true },
    },
  ];

  let lastErrors = [];
  for (const basicCodeDiscount of attempts) {
    try {
      const created = await client.request(
        `#graphql
        mutation CreateSyspricingNativeCode($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  codes(first: 1) { nodes { code } }
                }
              }
            }
            userErrors { field message code }
          }
        }`,
        { variables: { basicCodeDiscount } }
      );
      const payload = created.data?.discountCodeBasicCreate;
      const errors = payload?.userErrors || [];
      if (!errors.length && payload?.codeDiscountNode?.id) {
        const issued =
          payload.codeDiscountNode.codeDiscount?.codes?.nodes?.[0]?.code || code;
        return {
          ok: true,
          code: issued,
          discountId: payload.codeDiscountNode.id,
        };
      }
      lastErrors = errors.length ? errors : [{ message: formatGqlErrors(created) }];
    } catch (err) {
      lastErrors = [{ message: err.message || String(err) }];
    }
  }

  return { ok: false, errors: lastErrors };
}

function groupLinesByUnitOff(rows, maxCodes = MAX_COMBINABLE_CODES) {
  const map = new Map();
  for (const row of rows || []) {
    const key = Number(row.unitOff).toFixed(2);
    if (!map.has(key)) {
      map.set(key, {
        unitOff: key,
        appliesOnEachItem: true,
        variantGids: [],
        pooledAmount: 0,
        lineCount: 0,
      });
    }
    const group = map.get(key);
    if (!group.variantGids.includes(row.variantGid)) group.variantGids.push(row.variantGid);
    group.pooledAmount = roundMoney(group.pooledAmount + Number(row.off || 0));
    group.lineCount += Number(row.qty || 1);
  }

  const groups = [...map.values()];
  if (groups.length <= maxCodes) return groups;

  groups.sort((a, b) => b.lineCount - a.lineCount);
  const keep = groups.slice(0, maxCodes - 1);
  const rest = groups.slice(maxCodes - 1);
  keep.push({
    unitOff: rest.map((g) => g.unitOff).join('|'),
    appliesOnEachItem: false,
    variantGids: [...new Set(rest.flatMap((g) => g.variantGids))],
    pooledAmount: roundMoney(rest.reduce((sum, g) => sum + g.pooledAmount, 0)),
    lineCount: rest.reduce((sum, g) => sum + g.lineCount, 0),
  });
  return keep;
}

function formatGqlErrors(created) {
  const list = created?.errors || created?.body?.errors;
  if (!Array.isArray(list) || !list.length) return 'discountCodeBasicCreate failed';
  return list.map((e) => e.message).join('; ');
}

function normalizeLines(lines) {
  const out = [];
  for (const raw of lines || []) {
    const variantId = String(raw.variantId || raw.id || '').trim();
    const qty = Math.max(1, parseInt(raw.quantity || raw.qty || 1, 10) || 1);
    if (!variantId) continue;
    const numericId = variantId.replace(/^gid:\/\/shopify\/ProductVariant\//, '');
    out.push({
      numericId,
      variantGid: `gid://shopify/ProductVariant/${numericId}`,
      qty,
    });
  }
  return out;
}

async function fetchCatalogPrices(client, gids) {
  const unique = [...new Set(gids)];
  const map = new Map();
  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const ids = unique.slice(i, i + chunkSize);
    const res = await client.request(
      `#graphql
      query CatalogVariantPrices($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant { id price }
        }
      }`,
      { variables: { ids } }
    );
    for (const node of res.data?.nodes || []) {
      if (!node?.id) continue;
      const numeric = String(node.id).split('/').pop();
      map.set(numeric, Number(node.price));
    }
  }
  return map;
}

function toCustomerGid(id) {
  if (!id) return null;
  const s = String(id).trim();
  if (!s) return null;
  if (s.startsWith('gid://')) return s;
  return `gid://shopify/Customer/${s}`;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

module.exports = {
  createNativeCheckoutDiscount,
  groupLinesByUnitOff,
  MAX_COMBINABLE_CODES,
};
