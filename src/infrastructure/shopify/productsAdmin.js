'use strict';

const { DomainError } = require('../../domain/errors');

function numericId(gidOrId) {
  return String(gidOrId || '').replace(/^gid:\/\/shopify\/[^/]+\//, '');
}

function toProductGid(id) {
  const s = String(id || '');
  if (s.startsWith('gid://')) return s;
  return `gid://shopify/Product/${s}`;
}

function mapProductNode(node) {
  return {
    id: node.id,
    title: node.title,
    variants: (node.variants?.edges || node.variants?.nodes || []).map((ve) => {
      const v = ve.node || ve;
      let pricesByTag = {};
      try {
        pricesByTag = v.metafield?.value ? JSON.parse(v.metafield.value) : {};
      } catch (_err) {
        pricesByTag = {};
      }
      const displayName =
        v.displayName ||
        (node.title && v.title && v.title !== 'Default Title'
          ? `${node.title} - ${v.title}`
          : node.title || v.title || '');
      return {
        id: v.id,
        title: v.title,
        displayName,
        sku: v.sku || null,
        price: v.price,
        pricesByTag,
      };
    }),
  };
}

function createProductsAdmin({ getAdminClient }) {
  async function clientOrThrow(shop) {
    const client = await getAdminClient(shop);
    if (!client) {
      throw new DomainError('Shop not installed / no offline session', 'NO_SESSION', 401);
    }
    return client;
  }

  async function search(shop, { query = '', first = 25 } = {}) {
    const client = await clientOrThrow(shop);
    const q = String(query || '').trim();
    const data = await client.request(
      `#graphql
      query SearchProducts($first: Int!, $query: String) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    displayName
                    sku
                    price
                  }
                }
              }
            }
          }
        }
      }`,
      {
        variables: q
          ? { first: Math.min(Math.max(Number(first) || 25, 1), 50), query: q }
          : { first: Math.min(Math.max(Number(first) || 25, 1), 50) },
      }
    );

    if (data.errors?.length) {
      throw new DomainError(data.errors[0].message || 'Product search failed', 'SHOPIFY_ERROR', 502);
    }

    return (data.data?.products?.edges || []).map((e) => mapProductNode(e.node));
  }

  async function getByIds(shop, ids = []) {
    const client = await clientOrThrow(shop);
    const unique = [...new Set((ids || []).map((id) => toProductGid(id)).filter(Boolean))];
    if (!unique.length) return [];

    const out = [];
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const data = await client.request(
        `#graphql
        query ProductsByIds($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    displayName
                    sku
                    price
                    metafield(namespace: "syspricing", key: "prices") {
                      value
                    }
                  }
                }
              }
            }
          }
        }`,
        { variables: { ids: chunk } }
      );

      if (data.errors?.length) {
        throw new DomainError(data.errors[0].message || 'Product fetch failed', 'SHOPIFY_ERROR', 502);
      }

      for (const node of data.data?.nodes || []) {
        if (node && node.id) out.push(mapProductNode(node));
      }
    }
    return out;
  }

  async function listAll(shop, { maxProducts = 2500 } = {}) {
    const client = await clientOrThrow(shop);
    const out = [];
    let cursor = null;
    let guard = 0;
    const pageSize = 50;

    while (out.length < maxProducts && guard < 100) {
      guard += 1;
      const data = await client.request(
        `#graphql
        query AllProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      displayName
                      sku
                      price
                      metafield(namespace: "syspricing", key: "prices") {
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { variables: { first: pageSize, after: cursor } }
      );

      if (data.errors?.length) {
        throw new DomainError(data.errors[0].message || 'Product list failed', 'SHOPIFY_ERROR', 502);
      }

      const conn = data.data?.products;
      for (const edge of conn?.edges || []) {
        out.push(mapProductNode(edge.node));
        if (out.length >= maxProducts) break;
      }
      if (!conn?.pageInfo?.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }

    return out;
  }

  return { search, getByIds, listAll, numericId };
}

module.exports = { createProductsAdmin, numericId, toProductGid };
