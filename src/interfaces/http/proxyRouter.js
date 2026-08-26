'use strict';

const crypto = require('crypto');
const express = require('express');
const { createNativeCheckoutDiscount } = require('../../infrastructure/shopify/nativeCheckoutDiscount');

/**
 * App Proxy — storefront B2B prices for logged-in customers.
 * Storefront calls: /apps/syspricing/prices?variant_ids=123,456
 * Shopify forwards to: /proxy/prices?...&shop=&logged_in_customer_id=&signature=
 */
function createProxyRouter({ useCases, customersAdmin, getAdminClient, apiSecret }) {
  const router = express.Router();
  const nativeDiscount = createNativeCheckoutDiscount({ getAdminClient, useCases });

  async function resolveProxyCustomer(req) {
    const shop = String(req.query.shop || '')
      .trim()
      .toLowerCase();
    const customerId = req.query.logged_in_customer_id
      ? String(req.query.logged_in_customer_id).trim()
      : '';
    const tagsFromQuery = String(req.query.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let tags = [];
    let customer = null;
    let authSource = 'anonymous';

    if (customerId) {
      customer = await customersAdmin.getById(shop, customerId);
      if (customer) {
        tags = customer.tags && customer.tags.length ? customer.tags : tagsFromQuery;
        authSource = 'logged_in_customer_id';
      } else if (tagsFromQuery.length) {
        tags = tagsFromQuery;
        authSource = 'logged_in_id_tags_fallback';
      }
    }

    return { shop, customerId, tags, customer, authSource, tagsFromQuery };
  }

  router.use((req, res, next) => {
    if (!verifyAppProxyHmac(req.query, apiSecret)) {
      console.warn('[proxy] invalid signature', {
        shop: req.query.shop,
        hasSig: Boolean(req.query.signature || req.query.hmac),
      });
      res.status(401).json({ error: { code: 'INVALID_PROXY_SIGNATURE', message: 'Invalid signature' } });
      return;
    }
    next();
  });

  router.get('/prices', async (req, res) => {
    try {
      const { shop, customerId, tags, customer, authSource, tagsFromQuery } =
        await resolveProxyCustomer(req);

      if (!shop) {
        res.status(400).json({ error: { code: 'SHOP_REQUIRED', message: 'shop required' } });
        return;
      }

      console.log('[proxy/prices]', {
        shop,
        customerId: customerId || null,
        authSource,
        tags,
        variant_ids: req.query.variant_ids,
      });

      if (!tags.length) {
        res.status(200).json({
          data: {
            loggedIn: Boolean(customerId),
            authSource,
            prices: {},
            message:
              'No customer tags. New Customer Accounts may omit logged_in_customer_id — pass tags from Liquid.',
          },
        });
        return;
      }

      const variantIds = String(req.query.variant_ids || req.query.variantIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((id) => (id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`));

      const prices = {};
      for (const variantId of variantIds) {
        const resolved = useCases.resolve.run(shop, {
          tags,
          shopifyVariantId: variantId,
        });
        if (resolved.reason === 'ok' && resolved.price != null) {
          const numericId = variantId.split('/').pop();
          prices[numericId] = {
            variantId,
            price: resolved.price,
            matchedTag: resolved.matchedTag,
            currency: resolved.priceList?.currency || 'GTQ',
            reason: resolved.reason,
          };
          prices[variantId] = prices[numericId];
        } else {
          console.log('[proxy/prices] no match', { variantId, reason: resolved.reason, tags });
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        data: {
          loggedIn: Boolean(customerId),
          authSource,
          customerId: customer?.id || (customerId ? `gid://shopify/Customer/${customerId}` : null),
          tags,
          prices,
        },
      });
    } catch (err) {
      console.error('[proxy/prices]', err);
      res.status(500).json({
        error: { code: 'PROXY_ERROR', message: err.message || 'Proxy error' },
      });
    }
  });

  /**
   * Native checkout discount (no Functions): one-time amount-off code for catalog − B2B.
   * GET /apps/syspricing/checkout-discount?lines=VARIANT:QTY,...&tags=...
   */
  router.get('/checkout-discount', async (req, res) => {
    try {
      const { shop, customerId, tags, authSource } = await resolveProxyCustomer(req);
      if (!shop) {
        res.status(400).json({ error: { code: 'SHOP_REQUIRED', message: 'shop required' } });
        return;
      }
      if (!tags.length) {
        res.status(200).json({ data: { ok: true, skipped: true, reason: 'NO_TAGS', authSource } });
        return;
      }

      const lines = String(req.query.lines || '')
        .split(',')
        .map((part) => {
          const [id, qty] = String(part).split(':');
          return { variantId: String(id || '').trim(), quantity: qty };
        })
        .filter((line) => line.variantId);

      const result = await nativeDiscount.createForCart(shop, {
        customerId,
        tags,
        lines,
      });

      console.log('[proxy/checkout-discount]', {
        shop,
        customerId: customerId || null,
        authSource,
        skipped: Boolean(result.skipped),
        ok: result.ok,
        amount: result.amount,
        codes: result.codes || (result.code ? [result.code] : []),
        groups: result.groups || null,
        reason: result.reason || null,
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.ok ? 200 : 500).json({ data: result });
    } catch (err) {
      console.error('[proxy/checkout-discount]', err);
      res.status(500).json({
        error: { code: 'PROXY_ERROR', message: err.message || 'Proxy error' },
      });
    }
  });

  /** Liquid-friendly: also serve as JS that sets window.__SYSPRICING */
  router.get('/prices.js', async (req, res, next) => {
    req.url = '/prices';
    req.query = req.query;
    // Reuse JSON handler via internal call — simpler duplicate:
    try {
      const shop = String(req.query.shop || '').toLowerCase();
      const customerId = req.query.logged_in_customer_id
        ? String(req.query.logged_in_customer_id)
        : null;
      let payload = { loggedIn: false, prices: {} };
      if (shop && customerId && customersAdmin) {
        const customer = await customersAdmin.getById(shop, customerId);
        if (customer) {
          const variantIds = String(req.query.variant_ids || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((id) => (id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`));
          const prices = {};
          for (const variantId of variantIds) {
            const resolved = useCases.resolve.run(shop, {
              tags: customer.tags,
              shopifyVariantId: variantId,
            });
            if (resolved.reason === 'ok' && resolved.price != null) {
              const numericId = variantId.split('/').pop();
              prices[numericId] = {
                price: resolved.price,
                matchedTag: resolved.matchedTag,
                currency: resolved.priceList?.currency || 'GTQ',
              };
            }
          }
          payload = { loggedIn: true, tags: customer.tags, prices };
        }
      }
      res.type('application/javascript').send(
        `window.__SYSPRICING=${JSON.stringify(payload)};`
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function verifyAppProxyHmac(query, secret) {
  if (!secret) return false;
  const signature = query.signature || query.hmac;
  if (!signature) return false;

  const params = { ...query };
  delete params.signature;
  delete params.hmac;

  const message = Object.keys(params)
    .sort()
    .map((key) => {
      const val = params[key];
      return `${key}=${Array.isArray(val) ? val.join(',') : val}`;
    })
    .join('');

  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(String(signature), 'utf8'));
  } catch {
    return digest === signature;
  }
}

module.exports = { createProxyRouter, verifyAppProxyHmac };
