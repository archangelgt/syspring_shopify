'use strict';

const { DomainError } = require('../../domain/errors');

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

    return (data.data?.products?.edges || []).map((e) => {
      const node = e.node;
      return {
        id: node.id,
        title: node.title,
        variants: (node.variants?.edges || []).map((ve) => ({
          id: ve.node.id,
          title: ve.node.title,
          sku: ve.node.sku || null,
          price: ve.node.price,
        })),
      };
    });
  }

  async function getByIds(shop, ids = []) {
    const client = await clientOrThrow(shop);
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unique.length) return [];

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
      { variables: { ids: unique.slice(0, 100) } }
    );

    if (data.errors?.length) {
      throw new DomainError(data.errors[0].message || 'Product fetch failed', 'SHOPIFY_ERROR', 502);
    }

    return (data.data?.nodes || [])
      .filter((n) => n && n.id)
      .map((node) => ({
        id: node.id,
        title: node.title,
        variants: (node.variants?.edges || []).map((ve) => {
          let pricesByTag = {};
          try {
            pricesByTag = ve.node.metafield?.value
              ? JSON.parse(ve.node.metafield.value)
              : {};
          } catch (_err) {
            pricesByTag = {};
          }
          return {
            id: ve.node.id,
            title: ve.node.title,
            sku: ve.node.sku || null,
            price: ve.node.price,
            pricesByTag,
          };
        }),
      }));
  }

  return { search, getByIds };
}

module.exports = { createProductsAdmin };
