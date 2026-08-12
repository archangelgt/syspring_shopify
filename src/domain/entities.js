'use strict';

const { randomUUID } = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function createPriceList({
  id,
  shop,
  tag,
  name,
  currency = 'GTQ',
  status = 'draft',
  priority = 0,
  createdAt,
  updatedAt,
}) {
  const ts = nowIso();
  const allowed = new Set(['draft', 'active', 'archived']);
  const normalizedTag = normalizeTag(tag);
  return {
    id: id || randomUUID(),
    shop,
    tag: normalizedTag,
    name: String(name || normalizedTag || '').trim() || normalizedTag,
    currency: String(currency || 'GTQ').trim().toUpperCase(),
    status: allowed.has(status) ? status : 'draft',
    priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
    createdAt: createdAt || ts,
    updatedAt: updatedAt || ts,
  };
}

function createVariantPrice({
  id,
  priceListId,
  shopifyVariantId,
  shopifyProductId = null,
  sku = null,
  price,
  compareAtPrice = null,
  createdAt,
  updatedAt,
}) {
  const ts = nowIso();
  return {
    id: id || randomUUID(),
    priceListId,
    shopifyVariantId: String(shopifyVariantId || '').trim(),
    shopifyProductId: shopifyProductId == null ? null : String(shopifyProductId).trim(),
    sku: sku == null ? null : String(sku).trim(),
    price: normalizeMoney(price),
    compareAtPrice:
      compareAtPrice == null || compareAtPrice === '' ? null : normalizeMoney(compareAtPrice),
    createdAt: createdAt || ts,
    updatedAt: updatedAt || ts,
  };
}

function createActivityLog({
  id,
  shop,
  actor = 'system',
  action,
  entityType,
  entityId = null,
  payload = null,
  createdAt,
}) {
  return {
    id: id || randomUUID(),
    shop,
    actor: String(actor || 'system'),
    action: String(action || '').trim(),
    entityType: String(entityType || '').trim(),
    entityId: entityId == null ? null : String(entityId),
    payload: payload == null ? null : payload,
    createdAt: createdAt || nowIso(),
  };
}

function normalizeMoney(value) {
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return n.toFixed(2);
}

/**
 * Multi-tag resolve: active lists ∩ tags → priority DESC → first list with a variant price.
 */
function resolveVariantPrice({ customerTags, priceLists, variantPrices, shopifyVariantId }) {
  const tags = new Set(
    (customerTags || []).map((t) => normalizeTag(t)).filter(Boolean)
  );
  if (!tags.size) {
    return { price: null, priceList: null, matchedTag: null, reason: 'no_tags' };
  }

  const active = (priceLists || [])
    .filter((pl) => pl.status === 'active' && tags.has(normalizeTag(pl.tag)))
    .sort((a, b) => b.priority - a.priority || a.tag.localeCompare(b.tag));

  if (!active.length) {
    return { price: null, priceList: null, matchedTag: null, reason: 'no_matching_price_list' };
  }

  for (const priceList of active) {
    const match = (variantPrices || []).find(
      (vp) =>
        vp.priceListId === priceList.id &&
        (String(vp.shopifyVariantId) === String(shopifyVariantId) ||
          String(vp.shopifyVariantId).replace(/^gid:\/\/shopify\/ProductVariant\//, '') ===
            String(shopifyVariantId).replace(/^gid:\/\/shopify\/ProductVariant\//, ''))
    );
    if (match) {
      return {
        price: match.price,
        priceList,
        variantPrice: match,
        matchedTag: priceList.tag,
        reason: 'ok',
      };
    }
  }

  return {
    price: null,
    priceList: active[0],
    matchedTag: active[0].tag,
    reason: 'no_variant_price',
  };
}

/** Discount % vs catalog base (WSH-style display). */
function discountPercent(basePrice, listPrice) {
  const base = Number(basePrice);
  const list = Number(listPrice);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(list)) return null;
  return (((base - list) / base) * 100).toFixed(2);
}

module.exports = {
  createPriceList,
  createVariantPrice,
  createActivityLog,
  normalizeMoney,
  normalizeTag,
  resolveVariantPrice,
  discountPercent,
  nowIso,
};
