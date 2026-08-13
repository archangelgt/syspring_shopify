'use strict';

const express = require('express');
const { DomainError } = require('../../domain/errors');

function createApiRouter({
  useCases,
  requireShop,
  getAdminClient,
  ensureMetafieldDefinitions,
  metafieldSync,
  discountSetup,
}) {
  const router = express.Router();
  router.use(express.json({ limit: '20mb' }));
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

  router.get('/collections', async (req, res, next) => {
    try {
      if (!useCases.products?.collections) {
        throw new DomainError('Collections not available', 'NO_COLLECTIONS', 503);
      }
      const data = await useCases.products.collections(req.shop, {
        query: req.query.q || req.query.query || '',
        first: req.query.first,
      });
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
      const data = await useCases.importCsv.run(
        req.shop,
        {
          csv: req.body?.csv || req.body?.text || '',
          xlsxBase64: req.body?.xlsxBase64 || req.body?.fileBase64 || null,
        },
        {
          priceListId: req.body?.priceListId || req.query.priceListId,
          tag: req.body?.tag || req.query.tag,
          createMissingLists: req.body?.createMissingLists !== false,
        }
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/export/csv', async (req, res, next) => {
    try {
      if (!useCases.exportCsv) {
        throw new DomainError('Export not available', 'NO_EXPORT', 503);
      }
      const productIds = Array.isArray(req.body?.productIds)
        ? req.body.productIds
        : String(req.body?.productIds || req.query.productIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      const collectionIds = Array.isArray(req.body?.collectionIds)
        ? req.body.collectionIds.map(String).filter(Boolean)
        : String(req.body?.collectionIds || req.query.collectionIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      const collectionId = String(
        req.body?.collectionId || req.query.collectionId || ''
      ).trim();
      const collectionHandle = String(
        req.body?.collectionHandle || req.query.collectionHandle || ''
      ).trim();
      if (collectionId) collectionIds.push(collectionId);
      const uniqueCollectionIds = [...new Set(collectionIds)];
      const hasCollection = uniqueCollectionIds.length > 0 || Boolean(collectionHandle);
      const all = hasCollection
        ? false
        : Boolean(req.body?.all || req.query.all === '1') || productIds.length === 0;
      const format =
        String(req.body?.format || req.query.format || 'xlsx').toLowerCase() === 'csv'
          ? 'csv'
          : 'xlsx';
      const data = await useCases.exportCsv.run(req.shop, {
        productIds,
        collectionIds: uniqueCollectionIds,
        collectionHandle,
        all,
        format,
      });
      if (req.query.download === '1' || req.body?.download) {
        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${data.meta.filename || 'syspricing-export.csv'}"`
          );
          res.send(data.csv);
          return;
        }
        const buf = Buffer.from(data.xlsxBase64, 'base64');
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${data.meta.filename || 'syspricing-export.xlsx'}"`
        );
        res.send(buf);
        return;
      }
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
      const definitions = await ensureMetafieldDefinitions(client);

      let functionConfig = null;
      if (metafieldSync?.syncFunctionConfig) {
        functionConfig = await metafieldSync.syncFunctionConfig(req.shop, client);
      }

      let discount = functionConfig?.discount || null;
      if ((!discount || discount.ok === false) && discountSetup?.ensureAutomaticDiscount) {
        const tags = functionConfig?.tags || [];
        const lists = useCases.priceLists
          ? useCases.priceLists.list(req.shop).filter((pl) => pl.status === 'active')
          : [];
        const priority = {};
        lists.forEach((pl) => {
          priority[pl.tag] = pl.priority;
        });
        discount = await discountSetup.ensureAutomaticDiscount(client, {
          tags: tags.length ? tags : lists.map((pl) => pl.tag),
          priority,
        });
      }

      res.json({
        data: {
          ...definitions,
          functionConfig,
          discount,
          message: discount?.ok
            ? 'Tienda preparada. Descuento automático B2B activo para carrito/checkout.'
            : discount?.hint ||
              'Tienda preparada. Si el carrito sigue con precio de catálogo: despliega la Function (shopify app deploy) y vuelve a pulsar Preparar tienda. Reautoriza scopes write_discounts si hace falta.',
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
