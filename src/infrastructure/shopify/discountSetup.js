'use strict';

const DISCOUNT_TITLE = 'SYSPRICING B2B';
const FUNCTION_HANDLE = 'syspricing-discount';
const META_NAMESPACE = 'syspricing';
const META_KEY = 'function-config';

/**
 * Ensures an automatic app discount exists for the Discount Function and
 * keeps syspricing.function-config on that discount in sync (feeds $tags).
 */
function createDiscountSetup({ functionHandle = FUNCTION_HANDLE } = {}) {
  async function ensureAutomaticDiscount(client, config) {
    if (!client) return { ok: false, reason: 'NO_CLIENT' };

    const tags = Array.isArray(config?.tags) ? config.tags.map(String) : [];
    const priority =
      config?.priority && typeof config.priority === 'object' ? config.priority : {};
    const value = JSON.stringify({ tags, priority });

    const existing = await findSyspricingDiscount(client);
    if (existing?.id) {
      await setDiscountConfigMetafield(client, existing.id, value);
      if (existing.status === 'EXPIRED' || existing.status === 'SCHEDULED') {
        // Best-effort: leave as-is; merchant can reactivate in Admin if needed.
      }
      return {
        ok: true,
        created: false,
        discountId: existing.id,
        status: existing.status,
        tags,
      };
    }

    const functionId = await resolveFunctionId(client, functionHandle);
    const input = {
      title: DISCOUNT_TITLE,
      startsAt: new Date().toISOString(),
      discountClasses: ['PRODUCT'],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
      metafields: [
        {
          namespace: META_NAMESPACE,
          key: META_KEY,
          type: 'json',
          value,
        },
      ],
    };

    if (functionId) {
      input.functionId = functionId;
    } else {
      input.functionHandle = functionHandle;
    }

    const created = await client.request(
      `#graphql
      mutation CreateSyspricingDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
            status
          }
          userErrors { field message code }
        }
      }`,
      { variables: { automaticAppDiscount: input } }
    );

    const payload = created.data?.discountAutomaticAppCreate;
    const errors = payload?.userErrors || [];
    if (errors.length) {
      const msg = errors.map((e) => e.message).join('; ');
      console.warn('[discountSetup] create', msg);
      return {
        ok: false,
        reason: 'CREATE_FAILED',
        errors,
        hint:
          /function|handle|id/i.test(msg)
            ? 'Deploy the Discount Function first: shopify app deploy'
            : msg,
      };
    }

    const discountId = payload?.automaticAppDiscount?.discountId;
    return {
      ok: true,
      created: true,
      discountId,
      status: payload?.automaticAppDiscount?.status,
      tags,
      functionId: functionId || null,
    };
  }

  return { ensureAutomaticDiscount, findSyspricingDiscount, DISCOUNT_TITLE, FUNCTION_HANDLE };
}

async function findSyspricingDiscount(client) {
  const res = await client.request(
    `#graphql
    query FindSyspricingDiscount {
      discountNodes(first: 50, query: "title:${DISCOUNT_TITLE}*") {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp {
              title
              status
              appDiscountType {
                functionId
                functionHandle
              }
            }
          }
          metafield(namespace: "${META_NAMESPACE}", key: "${META_KEY}") {
            id
            value
          }
        }
      }
    }`
  );

  const nodes = res.data?.discountNodes?.nodes || [];
  for (const node of nodes) {
    const d = node.discount;
    if (!d || d.__typename !== 'DiscountAutomaticApp') continue;
    if (String(d.title || '') !== DISCOUNT_TITLE) continue;
    return {
      id: node.id,
      status: d.status,
      functionId: d.appDiscountType?.functionId,
      functionHandle: d.appDiscountType?.functionHandle,
      metafield: node.metafield,
    };
  }

  // Fallback: any automatic app discount from our function handle
  const all = await client.request(
    `#graphql
    query ListAutomaticAppDiscounts {
      automaticDiscountNodes(first: 50) {
        nodes {
          id
          automaticDiscount {
            __typename
            ... on DiscountAutomaticApp {
              title
              status
              appDiscountType {
                functionId
                functionHandle
              }
            }
          }
          metafield(namespace: "${META_NAMESPACE}", key: "${META_KEY}") {
            id
            value
          }
        }
      }
    }`
  ).catch(() => null);

  const autoNodes = all?.data?.automaticDiscountNodes?.nodes || [];
  for (const node of autoNodes) {
    const d = node.automaticDiscount;
    if (!d || d.__typename !== 'DiscountAutomaticApp') continue;
    const handle = d.appDiscountType?.functionHandle;
    if (handle === FUNCTION_HANDLE || String(d.title || '') === DISCOUNT_TITLE) {
      return {
        id: node.id,
        status: d.status,
        functionId: d.appDiscountType?.functionId,
        functionHandle: handle,
        metafield: node.metafield,
      };
    }
  }

  return null;
}

async function resolveFunctionId(client, handle) {
  const res = await client
    .request(
      `#graphql
    query ShopifyFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
          app { title }
        }
      }
    }`
    )
    .catch(() => null);

  const nodes = res?.data?.shopifyFunctions?.nodes || [];
  if (!nodes.length) return null;

  const lowerHandle = String(handle || '').toLowerCase();
  const byTitle =
    nodes.find((n) => String(n.title || '').toLowerCase().includes('syspricing')) ||
    nodes.find((n) => String(n.title || '').toLowerCase().includes(lowerHandle)) ||
    nodes.find((n) => /discount/i.test(String(n.apiType || '')) && /syspricing|b2b/i.test(String(n.title || '')));

  return byTitle?.id || null;
}

async function setDiscountConfigMetafield(client, ownerId, value) {
  const res = await client.request(
    `#graphql
    mutation SetDiscountConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: META_NAMESPACE,
            key: META_KEY,
            type: 'json',
            value,
          },
        ],
      },
    }
  );
  const errors = res.data?.metafieldsSet?.userErrors || [];
  if (errors.length) {
    console.warn('[discountSetup] metafield', errors.map((e) => e.message).join('; '));
  }
  return { ok: !errors.length, errors };
}

module.exports = { createDiscountSetup, DISCOUNT_TITLE, FUNCTION_HANDLE };
