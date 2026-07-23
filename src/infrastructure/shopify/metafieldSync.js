'use strict';

/**
 * Projects tag prices into Shopify variant metafields for Functions.
 * Also builds function-config JSON: { tags, priority } for hasTags($tags).
 */
function createMetafieldSync({
  getAdminClient,
  priceListRepo,
  variantPriceRepo,
  ensureMetafieldDefinitions,
}) {
  async function syncPriceList(shop, priceListId) {
    const list = priceListRepo.getById(shop, priceListId);
    if (!list || list.status !== 'active') return { synced: 0, skipped: true };

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

    const prices = variantPriceRepo.listByPriceList(priceListId);
    let synced = 0;

    for (const vp of prices) {
      if (!vp.shopifyVariantId || vp.shopifyVariantId.startsWith('sku:')) continue;
      const gid = toVariantGid(vp.shopifyVariantId);
      const existing = await readVariantPricesMetafield(client, gid);
      const next = { ...(existing || {}), [list.tag]: vp.price };
      await setVariantPricesMetafield(client, gid, next);
      synced += 1;
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
    const tags = lists.map((pl) => pl.tag);
    const priority = {};
    lists.forEach((pl) => {
      priority[pl.tag] = pl.priority;
    });
    // Shop-level metafield — merchant copies into discount function-config when deploying Function
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
              value: JSON.stringify({ tags, priority }),
            },
          ],
        },
      }
    );
    return { ok: true, tags };
  }

  return { syncPriceList, syncFunctionConfig };
}

function toVariantGid(id) {
  const s = String(id);
  if (s.startsWith('gid://')) return s;
  return `gid://shopify/ProductVariant/${s}`;
}

async function readVariantPricesMetafield(client, ownerId) {
  const data = await client.request(
    `#graphql
    query VariantPrices($id: ID!) {
      productVariant(id: $id) {
        metafield(namespace: "syspricing", key: "prices") { value }
      }
    }`,
    { variables: { id: ownerId } }
  );
  const raw = data?.data?.productVariant?.metafield?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function setVariantPricesMetafield(client, ownerId, pricesMap) {
  await client.request(
    `#graphql
    mutation SetVariantPrices($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: 'syspricing',
            key: 'prices',
            type: 'json',
            value: JSON.stringify(pricesMap),
          },
        ],
      },
    }
  );
}

async function getShopGid(client) {
  const data = await client.request(`#graphql { shop { id } }`);
  return data?.data?.shop?.id || null;
}

module.exports = { createMetafieldSync, toVariantGid };
