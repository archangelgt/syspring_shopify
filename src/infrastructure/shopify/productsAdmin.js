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

  return { search };
}

module.exports = { createProductsAdmin };
