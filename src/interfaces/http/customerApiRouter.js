'use strict';

/**
 * Customer-facing API (Portal / Flutter).
 * Auth: Shopify Customer Accounts OIDC (Rey Caps model).
 * Prices resolve from customer Shopify tags (= price lists).
 */
const express = require('express');
const { DomainError } = require('../../domain/errors');
const { normalizeTag } = require('../../domain/entities');

function createCustomerApiRouter({ useCases, customersAdmin }) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  router.use(async (req, res, next) => {
    try {
      const identity = await resolveCustomerIdentity(req);
      req.customerId = identity.customerId;
      req.shop = identity.shop;
      next();
    } catch (err) {
      const status = err.status || 401;
      res.status(status).json({
        error: {
          code: err.code || 'UNAUTHORIZED',
          message: err.message || 'Unauthorized',
        },
      });
    }
  });

  router.get('/me', async (req, res, next) => {
    try {
      const customer = await customersAdmin.getById(req.shop, req.customerId);
      if (!customer) throw new DomainError('Customer not found', 'NOT_FOUND', 404);

      const tagSet = new Set((customer.tags || []).map(normalizeTag));
      const lists = useCases.priceLists
        .list(req.shop)
        .filter((pl) => pl.status === 'active' && tagSet.has(pl.tag))
        .sort((a, b) => b.priority - a.priority);

      res.json({
        data: {
          customer,
          matchedPriceLists: lists,
          auth: {
            mode: process.env.CUSTOMER_AUTH_MODE || 'oidc',
            note: 'Price lists = customer tags on Shopify',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/prices', async (req, res, next) => {
    try {
      const customer = await customersAdmin.getById(req.shop, req.customerId);
      if (!customer) throw new DomainError('Customer not found', 'NOT_FOUND', 404);

      const variantIds = String(req.query.variantIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const prices = variantIds.map((variantId) => ({
        variantId,
        ...useCases.resolve.run(req.shop, {
          tags: customer.tags,
          shopifyVariantId: variantId,
        }),
      }));

      res.json({
        data: {
          tags: customer.tags,
          prices,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[customer-api]', err);
    res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Internal error',
      },
    });
  });

  return router;
}

async function resolveCustomerIdentity(req) {
  const mode = (process.env.CUSTOMER_AUTH_MODE || 'oidc').toLowerCase();
  const shopHeader =
    (typeof req.headers['x-shopify-shop-domain'] === 'string' &&
      req.headers['x-shopify-shop-domain']) ||
    (typeof req.query.shop === 'string' && req.query.shop) ||
    '';

  if (mode === 'dev') {
    const customerId = req.headers['x-shopify-customer-id'];
    if (!customerId || !shopHeader) {
      throw new DomainError(
        'Dev mode requires X-Shopify-Customer-Id and X-Shopify-Shop-Domain (or ?shop=)',
        'DEV_AUTH_REQUIRED',
        401
      );
    }
    return { customerId: String(customerId), shop: normalizeShop(shopHeader) };
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    throw new DomainError(
      'Bearer token required (Shopify Customer Accounts OIDC access token)',
      'BEARER_REQUIRED',
      401
    );
  }

  throw new DomainError(
    'Customer Accounts OIDC validation not enabled yet. Set CUSTOMER_AUTH_MODE=dev for local tests.',
    'OIDC_NOT_CONFIGURED',
    501
  );
}

function normalizeShop(shop) {
  return String(shop || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

module.exports = { createCustomerApiRouter };
