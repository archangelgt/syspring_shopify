'use strict';

const express = require('express');
const { DomainError } = require('../../domain/errors');

function createApiRouter({ useCases, requireShop, getAdminClient, ensureMetafieldDefinitions }) {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  router.use(requireShop);

  router.get('/price-lists', (req, res) => {
    res.json({ data: useCases.priceLists.list(req.shop) });
  });

  router.post('/price-lists', async (req, res, next) => {
    try {
      const data = await useCases.priceLists.create(req.shop, req.body || {});
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/price-lists/:id', (req, res, next) => {
    try {
      res.json({ data: useCases.priceLists.get(req.shop, req.params.id) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/price-lists/:id', async (req, res, next) => {
    try {
      const data = await useCases.priceLists.update(req.shop, req.params.id, req.body || {});
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/price-lists/:id', async (req, res, next) => {
    try {
      const data = await useCases.priceLists.remove(req.shop, req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/price-lists/:id/prices', (req, res, next) => {
    try {
      res.json({ data: useCases.prices.list(req.shop, req.params.id) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/price-lists/:id/prices', async (req, res, next) => {
    try {
      const rows = Array.isArray(req.body) ? req.body : req.body?.prices || [];
      const data = await useCases.prices.upsertMany(req.shop, req.params.id, rows);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/prices/matrix', async (req, res, next) => {
    try {
      const rows = Array.isArray(req.body) ? req.body : req.body?.prices || [];
      const data = await useCases.prices.upsertMatrix(req.shop, rows);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/products', async (req, res, next) => {
    try {
      const data = await useCases.products.search(req.shop, {
        query: req.query.q || req.query.query || '',
        first: req.query.first,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/import/csv', async (req, res, next) => {
    try {
      const csv = req.body?.csv || req.body?.text || '';
      const data = await useCases.importCsv.run(req.shop, csv, {
        priceListId: req.body?.priceListId || req.query.priceListId,
        tag: req.body?.tag || req.query.tag,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/customers', async (req, res, next) => {
    try {
      const data = await useCases.customers.search(req.shop, {
        query: req.query.q || req.query.query || '',
        first: req.query.first,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/activity', (req, res) => {
    res.json({ data: useCases.activity.list(req.shop, req.query.limit) });
  });

  router.get('/dashboard', (req, res) => {
    if (!useCases.dashboard) {
      res.status(503).json({ error: { code: 'NO_DASHBOARD', message: 'Dashboard not available' } });
      return;
    }
    res.json({ data: useCases.dashboard.summary(req.shop) });
  });

  router.get('/resolve', async (req, res, next) => {
    try {
      if (req.query.customerId) {
        const data = await useCases.resolve.forCustomer(req.shop, {
          customerId: req.query.customerId,
          shopifyVariantId: req.query.variantId,
        });
        res.json({ data });
        return;
      }
      const tags = String(req.query.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const data = useCases.resolve.run(req.shop, {
        tags,
        shopifyVariantId: req.query.variantId,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/storefront/setup', async (req, res, next) => {
    try {
      if (!getAdminClient || !ensureMetafieldDefinitions) {
        throw new DomainError('Storefront setup not configured', 'NO_SETUP', 503);
      }
      const client = await getAdminClient(req.shop);
      if (!client) throw new DomainError('No admin session', 'NO_SESSION', 401);
      const data = await ensureMetafieldDefinitions(client);
      if (useCases.priceLists) {
        const lists = useCases.priceLists.list(req.shop).filter((pl) => pl.status === 'active');
        for (const pl of lists) {
          // trigger sync via prices use case path if metafieldSync attached — best-effort no-op here
        }
      }
      res.json({
        data: {
          ...data,
          message: 'Tienda preparada. Activa el bloque de precio B2B en el editor del tema.',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.use((err, _req, res, _next) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({
      error: {
        code,
        message: err.message || 'Internal error',
      },
    });
  });

  return router;
}

module.exports = { createApiRouter };
