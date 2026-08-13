'use strict';

const { expandTagsForHasTags } = require('../../domain/entities');

/**
 * Projects tag prices into Shopify variant metafields for Functions.
 * Also builds function-config JSON: { tags, priority } for hasTags($tags).
 */
function createMetafieldSync({
  getAdminClient,
  priceListRepo,
  variantPriceRepo,
  ensureMetafieldDefinitions,
  discountSetup,
}) {
  async function syncPriceList(shop, priceListId) {
    const list = priceListRepo.getById(shop, priceListId);
    if (!list || list.status !== 'active') return { synced: 0, skipped: true };

    const prices = variantPriceRepo.listByPriceList(priceListId);
    const variantIds = prices
      .map((vp) => vp.shopifyVariantId)
      .filter((id) => id && !String(id).startsWith('sku:'));

    return syncVariantIds(shop, variantIds);
  }

  /**
   * Build full tag→price maps from SQLite (all active lists) and batch-write metafields.
   * No per-variant Shopify read — safe after bulk import.
   */
  async function syncVariantIds(shop, variantIds) {
    const ids = [
      ...new Set(
        (variantIds || [])
          .map((id) => String(id || '').trim())
          .filter((id) => id && !id.startsWith('sku:'))
      ),
    ];
    if (!ids.length) return { synced: 0, skipped: true };

    const client = await getAdminClient(shop);
    if (!client) {
      console.warn(`[metafieldSync] no admin client for ${shop}`);
      return { synced: 0, skipped: true };
    }

    if (ensureMetafieldDefinitions) {
      await ensureMetafieldDefinitions(client).catch((err) => {
        console.warn('[metafieldSync] definitions', err && err.message);
      });
    }

    const lists = priceListRepo.list(shop).filter((pl) => pl.status === 'active');
    const listById = new Map(lists.map((pl) => [pl.id, pl]));

    const lookupKeys = [];
    for (const id of ids) {
      lookupKeys.push(id);
      if (id.startsWith('gid://')) {
        const numeric = id.split('/').pop();
        if (numeric) lookupKeys.push(numeric);
      } else {
        lookupKeys.push(`gid://shopify/ProductVariant/${id}`);
      }
    }

    const rows = variantPriceRepo.listByVariantIds(shop, [...new Set(lookupKeys)]);
    const byGid = new Map();

    for (const vp of rows) {
      const pl = listById.get(vp.priceListId);
      if (!pl || !pl.tag) continue;
      const gid = toVariantGid(vp.shopifyVariantId);
      if (!byGid.has(gid)) byGid.set(gid, {});
      byGid.get(gid)[pl.tag] = Number(vp.price);
    }

    // Only write variants we were asked to sync (avoid rewriting unrelated rows).
    const wanted = new Set(ids.map(toVariantGid));
    const entries = [...byGid.entries()].filter(([gid]) => wanted.has(gid));

    let synced = 0;
    const chunkSize = 25;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const res = await client.request(
        `#graphql
        mutation SetVariantPrices($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            metafields: chunk.map(([ownerId, pricesMap]) => ({
              ownerId,
              namespace: 'syspricing',
              key: 'prices',
              type: 'json',
              value: JSON.stringify(pricesMap),
            })),
          },
        }
      );
      const errors = res.data?.metafieldsSet?.userErrors || [];
      if (errors.length) {
        console.warn(
          '[metafieldSync] prices',
          errors.map((e) => e.message).join('; ')
        );
      }
      synced += chunk.length;
    }

    await syncFunctionConfig(shop, client).catch((err) => {
      console.warn('[metafieldSync] function-config', err && err.message);
    });

    return { synced };
  }

  async function syncFunctionConfig(shop, client) {
    const admin = client || (await getAdminClient(shop));
    if (!admin) return { ok: false };
    const lists = priceListRepo.list(shop).filter((pl) => pl.status === 'active');
    const tags = expandTagsForHasTags(lists.map((pl) => pl.tag));
    const priority = {};
    lists.forEach((pl) => {
      priority[pl.tag] = pl.priority;
      for (const v of expandTagsForHasTags([pl.tag])) {
        priority[v] = pl.priority;
      }
    });
    const config = { tags, priority };
    const shopId = await getShopGid(admin);
    if (!shopId) return { ok: false };
    await admin.request(
      `#graphql
      mutation SetFunctionConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: 'syspricing',
              key: 'function-config',
              type: 'json',
              value: JSON.stringify(config),
            },
          ],
        },
      }
    );

    let discount = null;
    if (discountSetup?.ensureAutomaticDiscount) {
      discount = await discountSetup.ensureAutomaticDiscount(admin, config).catch((err) => {
        console.warn('[metafieldSync] discount setup', err && err.message);
        return { ok: false, reason: err && err.message };
      });
    }

    return { ok: true, tags, discount };
  }

  return { syncPriceList, syncVariantIds, syncFunctionConfig };
}

function toVariantGid(id) {
  const s = String(id);
  if (s.startsWith('gid://')) return s;
  return `gid://shopify/ProductVariant/${s}`;
}

async function getShopGid(client) {
  const res = await client.request(
    `#graphql
    query ShopGid {
      shop { id }
    }`
  );
  return res.data?.shop?.id || null;
}

module.exports = { createMetafieldSync, toVariantGid };
