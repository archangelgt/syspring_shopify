'use strict';

const {
  createPriceList,
  createVariantPrice,
  createActivityLog,
  resolveVariantPrice,
  normalizeTag,
  nowIso,
} = require('../domain/entities');
const { NotFoundError, ConflictError, DomainError } = require('../domain/errors');
const {
  isMatrixHeaders,
  buildPriceLookup,
  collectTagOrder,
  buildMatrixRows,
  rowsToCsv,
  rowsToXlsxBuffer,
  parseSpreadsheet,
  matrixRowsToPriceUpserts,
  parseCsvText,
} = require('./pricingMatrix');

function createUseCases({
  priceListRepo,
  variantPriceRepo,
  activityRepo,
  metafieldSync,
  customersAdmin,
  productsAdmin,
}) {
  async function log(shop, action, entityType, entityId, payload, actor = 'admin') {
    activityRepo.append(
      createActivityLog({ shop, actor, action, entityType, entityId, payload })
    );
  }

  const priceLists = {
    list(shop) {
      return priceListRepo.list(shop);
    },
    get(shop, id) {
      const pl = priceListRepo.getById(shop, id);
      if (!pl) throw new NotFoundError('Price list not found');
      return pl;
    },
    async create(shop, input, actor = 'admin') {
      if (!input.tag) throw new DomainError('tag is required');
      const tag = normalizeTag(input.tag);
      if (!tag) throw new DomainError('tag is required');
      if (priceListRepo.getByTag(shop, tag)) {
        throw new ConflictError(`Price list tag already exists: ${tag}`);
      }
      const list = createPriceList({
        shop,
        tag,
        name: input.name || tag,
        currency: input.currency || 'GTQ',
        status: input.status || 'draft',
        priority: input.priority,
      });
      priceListRepo.create(list);
      await log(shop, 'price_list.create', 'PriceList', list.id, list, actor);
      if (list.status === 'active' && metafieldSync) {
        await metafieldSync.syncPriceList(shop, list.id).catch((err) => {
          console.warn('[metafieldSync]', err && err.message);
        });
      }
      return list;
    },
    async update(shop, id, input, actor = 'admin') {
      const existing = priceListRepo.getById(shop, id);
      if (!existing) throw new NotFoundError('Price list not found');
      if (input.tag && normalizeTag(input.tag) !== existing.tag) {
        const clash = priceListRepo.getByTag(shop, input.tag);
        if (clash && clash.id !== id) throw new ConflictError('Price list tag already exists');
      }
      const list = createPriceList({
        ...existing,
        tag: input.tag !== undefined ? normalizeTag(input.tag) : existing.tag,
        name: input.name ?? existing.name,
        currency: input.currency ?? existing.currency,
        status: input.status ?? existing.status,
        priority: input.priority !== undefined ? input.priority : existing.priority,
        updatedAt: nowIso(),
      });
      priceListRepo.update(list);
      await log(shop, 'price_list.update', 'PriceList', id, list, actor);
      if (list.status === 'active' && metafieldSync) {
        await metafieldSync.syncPriceList(shop, list.id).catch((err) => {
          console.warn('[metafieldSync]', err && err.message);
        });
      }
      return list;
    },
    async remove(shop, id, actor = 'admin') {
      const existing = priceListRepo.getById(shop, id);
      if (!existing) throw new NotFoundError('Price list not found');
      priceListRepo.delete(shop, id);
      await log(shop, 'price_list.delete', 'PriceList', id, { id, tag: existing.tag }, actor);
      return { ok: true };
    },
  };

  const prices = {
    list(shop, priceListId) {
      const pl = priceListRepo.getById(shop, priceListId);
      if (!pl) throw new NotFoundError('Price list not found');
      return variantPriceRepo.listByPriceList(priceListId);
    },
    async upsertMany(shop, priceListId, rows, actor = 'admin') {
      const pl = priceListRepo.getById(shop, priceListId);
      if (!pl) throw new NotFoundError('Price list not found');
      const results = { created: 0, updated: 0, errors: [] };
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        try {
          if (!row.shopifyVariantId && !row.sku) {
            throw new DomainError('shopifyVariantId or sku required');
          }
          let variantId = row.shopifyVariantId;
          if (!variantId && row.sku) {
            const bySku = variantPriceRepo.findBySku(priceListId, row.sku);
            if (bySku) variantId = bySku.shopifyVariantId;
            else variantId = `sku:${row.sku}`;
          }
          const vp = createVariantPrice({
            priceListId,
            shopifyVariantId: variantId,
            shopifyProductId: row.shopifyProductId,
            sku: row.sku,
            price: row.price,
            compareAtPrice: row.compareAtPrice,
          });
          const { created } = variantPriceRepo.upsert(vp);
          if (created) results.created += 1;
          else results.updated += 1;
        } catch (err) {
          results.errors.push({ row: i + 1, message: err.message, data: row });
        }
      }
      await log(
        shop,
        'variant_prices.upsert',
        'PriceList',
        priceListId,
        { created: results.created, updated: results.updated, errorCount: results.errors.length },
        actor
      );
      if (pl.status === 'active' && metafieldSync) {
        await metafieldSync.syncPriceList(shop, priceListId).catch((err) => {
          console.warn('[metafieldSync]', err && err.message);
        });
      }
      return results;
    },
    async upsertMatrix(shop, rows, actor = 'admin') {
      const results = { created: 0, updated: 0, errors: [], syncedLists: [] };
      const touchedLists = new Set();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        try {
          const tag = normalizeTag(row.tag);
          if (!tag) throw new DomainError('tag required');
          if (row.price === '' || row.price == null) continue;
          const pl = priceListRepo.getByTag(shop, tag);
          if (!pl) throw new DomainError(`Unknown price list tag: ${tag}`);
          if (!row.shopifyVariantId && !row.variantId) {
            throw new DomainError('variantId required');
          }
          const vp = createVariantPrice({
            priceListId: pl.id,
            shopifyVariantId: row.shopifyVariantId || row.variantId,
            shopifyProductId: row.shopifyProductId || row.productId,
            sku: row.sku,
            price: row.price,
            compareAtPrice: row.compareAtPrice,
          });
          const { created } = variantPriceRepo.upsert(vp);
          if (created) results.created += 1;
          else results.updated += 1;
          if (pl.status === 'active') touchedLists.add(pl.id);
        } catch (err) {
          results.errors.push({ row: i + 1, message: err.message, data: row });
        }
      }
      await log(
        shop,
        'prices.matrix',
        'PriceList',
        null,
        { created: results.created, updated: results.updated, errorCount: results.errors.length },
        actor
      );
      if (metafieldSync) {
        for (const listId of touchedLists) {
          await metafieldSync.syncPriceList(shop, listId).catch((err) => {
            console.warn('[metafieldSync]', err && err.message);
          });
          results.syncedLists.push(listId);
        }
      }
      return results;
    },
  };

  const importCsv = {
    async run(
      shop,
      input,
      { priceListId, tag, createMissingLists = true } = {},
      actor = 'admin'
    ) {
      const payload =
        typeof input === 'string'
          ? { csv: input }
          : input && typeof input === 'object'
            ? input
            : { csv: '' };

      const parsed = parseSpreadsheet(payload);
      const { headers, rows } = parsed;
      if (!headers.length) {
        throw new DomainError('Empty spreadsheet', 'VALIDATION', 400);
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [],
        format: isMatrixHeaders(headers) ? 'matrix' : 'long',
        listsCreated: [],
      };

      const ensureList = (rawTag) => {
        const t = normalizeTag(rawTag);
        if (!t) return null;
        let pl = priceListRepo.getByTag(shop, t);
        if (pl) return pl;
        if (!createMissingLists) return null;
        pl = createPriceList({
          shop,
          tag: t,
          name: String(rawTag || t).trim() || t,
          status: 'active',
          priority: 0,
          currency: 'GTQ',
        });
        priceListRepo.create(pl);
        results.listsCreated.push(t);
        return pl;
      };

      let mapped = [];
      if (isMatrixHeaders(headers)) {
        const matrix = matrixRowsToPriceUpserts(headers, rows, {
          normalizeTag,
          ensureList,
        });
        mapped = matrix.mapped;
        results.errors.push(...matrix.errors);
      } else {
        for (const r of rows) {
          const lower = {};
          Object.keys(r).forEach((k) => {
            lower[String(k).trim().toLowerCase()] = r[k];
          });
          const rowTag = normalizeTag(lower.tag || tag || '');
          let listId = priceListId;
          if (!listId && rowTag) {
            const pl = ensureList(rowTag);
            if (!pl) {
              mapped.push({ _error: `Unknown tag: ${rowTag}`, ...r });
              continue;
            }
            listId = pl.id;
          }
          if (!listId) {
            mapped.push({ _error: 'tag or priceListId required', ...r });
            continue;
          }
          mapped.push({
            _priceListId: listId,
            sku: lower.sku || null,
            shopifyVariantId: lower.variant_id || lower.variantid || lower.shopify_variant_id || null,
            shopifyProductId: lower.product_id || lower.productid || null,
            price: lower.price,
            compareAtPrice: lower.compare_at_price || lower.compareatprice || null,
          });
        }
      }

      const byList = new Map();
      mapped.forEach((row, i) => {
        if (row._error) {
          results.errors.push({ row: i + 1, message: row._error, data: row });
          return;
        }
        if (!byList.has(row._priceListId)) byList.set(row._priceListId, []);
        byList.get(row._priceListId).push(row);
      });

      for (const [listId, listRows] of byList) {
        const part = await prices.upsertMany(shop, listId, listRows, actor);
        results.created += part.created;
        results.updated += part.updated;
        results.errors.push(...part.errors);
      }

      await log(shop, 'csv.import', 'PriceList', priceListId || tag || null, results, actor);
      return results;
    },
  };

  const activity = {
    list(shop, limit) {
      return activityRepo.list(shop, { limit });
    },
  };

  const resolve = {
    run(shop, { tags, shopifyVariantId }) {
      const customerTags = (tags || []).map(normalizeTag).filter(Boolean);
      const priceListsForShop = priceListRepo.list(shop);
      const variantPrices = customerTags.length
        ? variantPriceRepo.listForTags(shop, customerTags)
        : [];
      return resolveVariantPrice({
        customerTags,
        priceLists: priceListsForShop,
        variantPrices,
        shopifyVariantId,
      });
    },
    async forCustomer(shop, { customerId, shopifyVariantId }) {
      if (!customersAdmin) throw new DomainError('Customers admin not configured', 'NO_CLIENT', 503);
      const customer = await customersAdmin.getById(shop, customerId);
      if (!customer) throw new NotFoundError('Customer not found');
      return {
        customer,
        ...this.run(shop, { tags: customer.tags, shopifyVariantId }),
      };
    },
  };

  const customers = {
    async search(shop, { query, first } = {}) {
      if (!customersAdmin) throw new DomainError('Customers admin not configured', 'NO_CLIENT', 503);
      const rows = await customersAdmin.search(shop, { query, first });
      const lists = priceListRepo.list(shop).filter((pl) => pl.status === 'active');
      return rows.map((c) => {
        const tagSet = new Set((c.tags || []).map(normalizeTag));
        const matchedPriceLists = lists
          .filter((pl) => tagSet.has(pl.tag))
          .sort((a, b) => b.priority - a.priority);
        return { ...c, matchedPriceLists };
      });
    },
  };

  const products = {
    async search(shop, { query, first } = {}) {
      if (!productsAdmin) throw new DomainError('Products admin not configured', 'NO_CLIENT', 503);
      const items = await productsAdmin.search(shop, { query, first });
      const variantIds = items.flatMap((p) => p.variants.map((v) => v.id));
      const existing = variantPriceRepo.listByVariantIds(shop, variantIds);
      const lists = priceListRepo.list(shop);
      const byVariant = {};
      for (const vp of existing) {
        const pl = lists.find((l) => l.id === vp.priceListId);
        if (!pl) continue;
        if (!byVariant[vp.shopifyVariantId]) byVariant[vp.shopifyVariantId] = {};
        byVariant[vp.shopifyVariantId][pl.tag] = vp.price;
      }
      return {
        priceLists: lists.filter((l) => l.status === 'active' || l.status === 'draft'),
        products: items.map((p) => ({
          ...p,
          variants: p.variants.map((v) => ({
            ...v,
            tagPrices: byVariant[v.id] || {},
          })),
        })),
      };
    },
  };

  const dashboard = {
    summary(shop) {
      const lists = priceListRepo.list(shop);
      const activeLists = lists.filter((l) => l.status === 'active');
      const draftLists = lists.filter((l) => l.status === 'draft');
      const priceCount =
        typeof variantPriceRepo.countByShop === 'function'
          ? variantPriceRepo.countByShop(shop)
          : 0;
      const recent = activityRepo.list(shop, { limit: 8 });
      const checklist = {
        hasPriceLists: activeLists.length > 0,
        hasPrices: priceCount > 0,
        hasActivity: recent.length > 0,
      };
      const readyScore = [checklist.hasPriceLists, checklist.hasPrices].filter(Boolean).length;
      return {
        shop,
        stats: {
          priceLists: lists.length,
          activePriceLists: activeLists.length,
          draftPriceLists: draftLists.length,
          variantPrices: priceCount,
        },
        checklist,
        readyScore,
        readyTotal: 2,
        recentActivity: recent,
        storefront: {
          ready: true,
        },
        topTags: activeLists
          .slice()
          .sort((a, b) => b.priority - a.priority || a.tag.localeCompare(b.tag))
          .slice(0, 6)
          .map((pl) => ({ tag: pl.tag, name: pl.name, priority: pl.priority })),
      };
    },
  };

  const exportCsv = {
    async run(
      shop,
      { productIds = [], all = false, format = 'xlsx' } = {},
      actor = 'admin'
    ) {
      if (!productsAdmin) throw new DomainError('Products admin not configured', 'NO_CLIENT', 503);

      let products;
      if (all || !productIds || !productIds.length) {
        products = await productsAdmin.listAll(shop);
      } else {
        products = await productsAdmin.getByIds(shop, productIds);
      }

      const variantIds = products.flatMap((p) => (p.variants || []).map((v) => v.id));
      const { lists, byVariantTag } = buildPriceLookup(
        variantPriceRepo,
        priceListRepo,
        shop,
        variantIds
      );
      const tagOrder = collectTagOrder(lists, byVariantTag, products);
      const { rows, priceCount } = buildMatrixRows(products, tagOrder, byVariantTag);
      const csv = rowsToCsv(rows);
      const xlsx = rowsToXlsxBuffer(rows);
      const stamp = Date.now();
      const base = `syspricing-individual-pricing-${stamp}`;

      await log(
        shop,
        'csv.export',
        'Product',
        productIds.length === 1 ? productIds[0] : null,
        {
          products: products.length,
          variants: rows.length - 1,
          prices: priceCount,
          tags: tagOrder.length,
          format,
        },
        actor
      );

      return {
        csv,
        xlsxBase64: Buffer.from(xlsx).toString('base64'),
        meta: {
          products: products.length,
          variants: Math.max(rows.length - 1, 0),
          prices: priceCount,
          tags: tagOrder,
          format: format === 'csv' ? 'csv' : 'xlsx',
          filename: format === 'csv' ? `${base}.csv` : `${base}.xlsx`,
          sheet: 'Individual_Price',
        },
      };
    },
  };

  return { priceLists, prices, importCsv, exportCsv, activity, resolve, customers, products, dashboard };
}

module.exports = { createUseCases, parseCsv: (text) => parseCsvText(text).rows };
