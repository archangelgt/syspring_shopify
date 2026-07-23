'use strict';

const { DomainError } = require('../../domain/errors');

/**
 * Admin GraphQL helpers for Shopify Customers (read + tags).
 * Price list assignment = Shopify customer tags (managed in Admin).
 */
function createCustomersAdmin({ getAdminClient }) {
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
      query SearchCustomers($first: Int!, $query: String) {
        customers(first: $first, query: $query) {
          edges {
            node {
              id
              displayName
              email
              tags
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
      throw new DomainError(data.errors[0].message || 'Customer search failed', 'SHOPIFY_ERROR', 502);
    }

    return (data.data?.customers?.edges || []).map((e) => mapCustomer(e.node));
  }

  async function getById(shop, customerGid) {
    const client = await clientOrThrow(shop);
    const gid = toCustomerGid(customerGid);
    const data = await client.request(
      `#graphql
      query CustomerById($id: ID!) {
        customer(id: $id) {
          id
          displayName
          email
          tags
        }
      }`,
      { variables: { id: gid } }
    );
    if (data.errors?.length) {
      throw new DomainError(data.errors[0].message || 'Customer fetch failed', 'SHOPIFY_ERROR', 502);
    }
    const node = data.data?.customer;
    if (!node) return null;
    return mapCustomer(node);
  }

  return { search, getById };
}

function mapCustomer(node) {
  return {
    id: node.id,
    displayName: node.displayName || '',
    email: node.email || null,
    tags: node.tags || [],
  };
}

function toCustomerGid(id) {
  const s = String(id || '').trim();
  if (!s) throw new DomainError('customerId is required');
  if (s.startsWith('gid://')) return s;
  return `gid://shopify/Customer/${s}`;
}

module.exports = { createCustomersAdmin, toCustomerGid };
