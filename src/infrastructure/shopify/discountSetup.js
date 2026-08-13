'use strict';

const { expandTagsForHasTags } = require('../../domain/entities');

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

    const tags = expandTagsForHasTags(
      Array.isArray(config?.tags) ? config.tags.map(String) : []
    );
    const priority =
      config?.priority && typeof config.priority === 'object' ? { ...config.priority } : {};
    tags.forEach((t) => {
      if (priority[t] == null) {
        const lower = String(t).toLowerCase();
        if (priority[lower] != null) priority[t] = priority[lower];
      }
    });
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
    const baseInput = {
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

    // 2025-10: functionHandle is current; functionId is deprecated UUID.
    const attempts = [{ ...baseInput, functionHandle }];
    if (functionId) {
      attempts.push({ ...baseInput, functionId: toFunctionId(functionId) });
    }

    let lastErrors = [];
    for (const automaticAppDiscount of attempts) {
      try {
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
          { variables: { automaticAppDiscount } }
        );

        const gqlErrors = created.errors || created.data?.errors || [];
        const payload = created.data?.discountAutomaticAppCreate;
        const errors = payload?.userErrors || [];
        if (!errors.length && payload?.automaticAppDiscount?.discountId) {
          return {
            ok: true,
            created: true,
            discountId: payload.automaticAppDiscount.discountId,
            status: payload.automaticAppDiscount.status,
            tags,
            functionId: functionId || null,
            functionHandle,
          };
        }
        lastErrors = errors.length
          ? errors
          : gqlErrors.length
            ? gqlErrors.map((e) => ({ message: e.message || String(e) }))
            : [{ message: 'empty discountAutomaticAppCreate response' }];
        console.warn('[discountSetup] create', lastErrors.map((e) => e.message).join('; '));
      } catch (err) {
        lastErrors = [{ message: err && err.message ? err.message : String(err) }];
        console.warn('[discountSetup] create', lastErrors[0].message);
      }
    }

    const msg = lastErrors.map((e) => e.message).join('; ') || 'NO_FUNCTION';
    const plusBlocked = /Plus plan/i.test(msg);
    return {
      ok: false,
      reason: plusBlocked ? 'PLUS_REQUIRED' : functionId ? 'CREATE_FAILED' : 'NO_FUNCTION',
      errors: lastErrors,
      hint: plusBlocked
        ? 'Shopify bloquea Discount Functions en apps custom si la tienda no es Plus. Opciones: (1) pasar syspricing-somosface a distribución pública unlisted, o (2) subir SomosFace a Shopify Plus. El deploy de la Function ya está hecho.'
        : /function|handle|id/i.test(msg) || !functionId
          ? 'Deploy the Discount Function first: shopify app deploy (handle syspricing-discount)'
          : msg,
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
      metafield: node.metafield,
    };
  }

  // Fallback: any automatic app discount titled SYSPRICING / from our app
  const all = await client
    .request(
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
    )
    .catch(() => null);

  const autoNodes = all?.data?.automaticDiscountNodes?.nodes || [];
  for (const node of autoNodes) {
    const d = node.automaticDiscount;
    if (!d || d.__typename !== 'DiscountAutomaticApp') continue;
    if (String(d.title || '') === DISCOUNT_TITLE || /syspricing/i.test(String(d.title || ''))) {
      return {
        id: node.id,
        status: d.status,
        functionId: d.appDiscountType?.functionId,
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
          handle
          title
          apiType
        }
      }
    }`
    )
    .catch(() => null);

  const nodes = res?.data?.shopifyFunctions?.nodes || [];
  if (!nodes.length) return null;

  const lowerHandle = String(handle || '').toLowerCase();
  const match =
    nodes.find((n) => String(n.handle || '').toLowerCase() === lowerHandle) ||
    nodes.find((n) => String(n.title || '').toLowerCase().includes('syspricing')) ||
    nodes.find((n) => String(n.title || '').toLowerCase().includes(lowerHandle)) ||
    nodes.find((n) => /discount/i.test(String(n.apiType || '')) && /syspricing|b2b/i.test(String(n.title || '')));

  return match?.id || null;
}

function toFunctionId(id) {
  const s = String(id || '');
  if (!s) return s;
  if (s.includes('/')) return s.split('/').pop();
  return s;
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
