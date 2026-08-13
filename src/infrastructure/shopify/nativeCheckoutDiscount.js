'use strict';

const crypto = require('crypto');

/**
 * Native Shopify discount codes (not Functions). Works on non-Plus + custom apps.
 * Creates a one-time amount-off code equal to catalog − B2B for the current cart.
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
    const variantGids = [];
    const unitOffs = [];

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
      variantGids.push(line.variantGid);
      unitOffs.push(unitOff);
      breakdown.push({
        variantId: line.numericId,
        qty: line.qty,
        catalog,
        b2b,
        off: lineOff,
      });
    }

    if (amount < 0.01 || !variantGids.length) return { ok: true, skipped: true, amount: 0 };

    const uniqueUnitOffs = [...new Set(unitOffs.map((n) => n.toFixed(2)))];
    const appliesOnEachItem = uniqueUnitOffs.length === 1;
    const discountAmount = appliesOnEachItem ? uniqueUnitOffs[0] : amount.toFixed(2);

    const code = `SP${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const customerGid = toCustomerGid(customerId);
    const customerGets = {
      value: { discountAmount: { amount: discountAmount, appliesOnEachItem } },
      items: { products: { productVariantsToAdd: [...new Set(variantGids)] } },
    };
    const base = {
      title: `SYSPRICING B2B ${code}`,
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
        customerSelection: customerGid
          ? { customers: { add: [customerGid] } }
          : { all: true },
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
            amount: Number(discountAmount),
            appliesOnEachItem,
            breakdown,
            discountId: payload.codeDiscountNode.id,
          };
        }
        lastErrors = errors.length ? errors : [{ message: formatGqlErrors(created) }];
      } catch (err) {
        lastErrors = [{ message: err.message || String(err) }];
      }
    }

    return {
      ok: false,
      reason: 'CREATE_FAILED',
      errors: lastErrors,
      hint: lastErrors.map((e) => e.message).join('; ') || 'discountCodeBasicCreate failed',
    };
  }

  return { createForCart };
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

module.exports = { createNativeCheckoutDiscount };
