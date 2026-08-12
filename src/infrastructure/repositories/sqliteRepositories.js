'use strict';

const {
  createPriceList,
  createVariantPrice,
  createActivityLog,
  nowIso,
} = require('../../domain/entities');

function mapPriceList(row) {
  if (!row) return null;
  return createPriceList({
    id: row.id,
    shop: row.shop,
    tag: row.tag,
    name: row.name,
    currency: row.currency,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapVariantPrice(row) {
  if (!row) return null;
  return createVariantPrice({
    id: row.id,
    priceListId: row.price_list_id,
    shopifyVariantId: row.shopify_variant_id,
    shopifyProductId: row.shopify_product_id,
    sku: row.sku,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapActivity(row) {
  if (!row) return null;
  return createActivityLog({
    id: row.id,
    shop: row.shop,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.created_at,
  });
}

function createRepositories(db) {
  const priceListRepo = {
    list(shop) {
      return db
        .prepare(`SELECT * FROM price_lists WHERE shop = ? ORDER BY priority DESC, tag ASC`)
        .all(shop)
        .map(mapPriceList);
    },
    getById(shop, id) {
      return mapPriceList(
        db.prepare(`SELECT * FROM price_lists WHERE shop = ? AND id = ?`).get(shop, id)
      );
    },
    getByTag(shop, tag) {
      const normalized = String(tag || '')
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase();
      return mapPriceList(
        db
          .prepare(`SELECT * FROM price_lists WHERE shop = ? AND tag = ?`)
          .get(shop, normalized)
      );
    },
    listActiveByTags(shop, tags) {
      if (!tags.length) return [];
      const placeholders = tags.map(() => '?').join(',');
      return db
        .prepare(
          `SELECT * FROM price_lists
           WHERE shop = ? AND status = 'active' AND tag IN (${placeholders})
           ORDER BY priority DESC, tag ASC`
        )
        .all(shop, ...tags)
        .map(mapPriceList);
    },
    create(list) {
      db.prepare(
        `INSERT INTO price_lists
          (id, shop, tag, name, currency, status, priority, created_at, updated_at)
         VALUES (@id, @shop, @tag, @name, @currency, @status, @priority, @created_at, @updated_at)`
      ).run({
        id: list.id,
        shop: list.shop,
        tag: list.tag,
        name: list.name,
        currency: list.currency,
        status: list.status,
        priority: list.priority,
        created_at: list.createdAt,
        updated_at: list.updatedAt,
      });
      return list;
    },
    update(list) {
      db.prepare(
        `UPDATE price_lists SET
          tag = @tag,
          name = @name,
          currency = @currency,
          status = @status,
          priority = @priority,
          updated_at = @updated_at
         WHERE shop = @shop AND id = @id`
      ).run({
        id: list.id,
        shop: list.shop,
        tag: list.tag,
        name: list.name,
        currency: list.currency,
        status: list.status,
        priority: list.priority,
        updated_at: list.updatedAt,
      });
      return list;
    },
    delete(shop, id) {
      db.prepare(`DELETE FROM variant_prices WHERE price_list_id = ?`).run(id);
      const info = db.prepare(`DELETE FROM price_lists WHERE shop = ? AND id = ?`).run(shop, id);
      return info.changes > 0;
    },
  };

  const variantPriceRepo = {
    listByPriceList(priceListId) {
      return db
        .prepare(
          `SELECT * FROM variant_prices WHERE price_list_id = ? ORDER BY sku ASC, shopify_variant_id ASC`
        )
        .all(priceListId)
        .map(mapVariantPrice);
    },
    listByVariantIds(shop, variantIds) {
      if (!variantIds.length) return [];
      const placeholders = variantIds.map(() => '?').join(',');
      return db
        .prepare(
          `SELECT vp.* FROM variant_prices vp
           INNER JOIN price_lists pl ON pl.id = vp.price_list_id
           WHERE pl.shop = ? AND vp.shopify_variant_id IN (${placeholders})`
        )
        .all(shop, ...variantIds)
        .map(mapVariantPrice);
    },
    getByVariant(priceListId, shopifyVariantId) {
      return mapVariantPrice(
        db
          .prepare(
            `SELECT * FROM variant_prices WHERE price_list_id = ? AND shopify_variant_id = ?`
          )
          .get(priceListId, String(shopifyVariantId))
      );
    },
    findBySku(priceListId, sku) {
      return mapVariantPrice(
        db
          .prepare(`SELECT * FROM variant_prices WHERE price_list_id = ? AND sku = ? LIMIT 1`)
          .get(priceListId, String(sku))
      );
    },
    upsert(vp) {
      const existing = this.getByVariant(vp.priceListId, vp.shopifyVariantId);
      if (existing) {
        const updated = createVariantPrice({
          ...existing,
          shopifyProductId: vp.shopifyProductId ?? existing.shopifyProductId,
          sku: vp.sku ?? existing.sku,
          price: vp.price,
          compareAtPrice: vp.compareAtPrice,
          updatedAt: nowIso(),
        });
        db.prepare(
          `UPDATE variant_prices SET
            shopify_product_id = @shopify_product_id,
            sku = @sku,
            price = @price,
            compare_at_price = @compare_at_price,
            updated_at = @updated_at
           WHERE id = @id`
        ).run({
          id: updated.id,
          shopify_product_id: updated.shopifyProductId,
          sku: updated.sku,
          price: updated.price,
          compare_at_price: updated.compareAtPrice,
          updated_at: updated.updatedAt,
        });
        return { entity: updated, created: false };
      }
      db.prepare(
        `INSERT INTO variant_prices
          (id, price_list_id, shopify_variant_id, shopify_product_id, sku, price, compare_at_price, created_at, updated_at)
         VALUES (@id, @price_list_id, @shopify_variant_id, @shopify_product_id, @sku, @price, @compare_at_price, @created_at, @updated_at)`
      ).run({
        id: vp.id,
        price_list_id: vp.priceListId,
        shopify_variant_id: vp.shopifyVariantId,
        shopify_product_id: vp.shopifyProductId,
        sku: vp.sku,
        price: vp.price,
        compare_at_price: vp.compareAtPrice,
        created_at: vp.createdAt,
        updated_at: vp.updatedAt,
      });
      return { entity: vp, created: true };
    },
    listForTags(shop, tags) {
      if (!tags.length) return [];
      const placeholders = tags.map(() => '?').join(',');
      return db
        .prepare(
          `SELECT vp.* FROM variant_prices vp
           INNER JOIN price_lists pl ON pl.id = vp.price_list_id
           WHERE pl.shop = ? AND pl.status = 'active' AND pl.tag IN (${placeholders})`
        )
        .all(shop, ...tags)
        .map(mapVariantPrice);
    },
    countByShop(shop) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM variant_prices vp
           INNER JOIN price_lists pl ON pl.id = vp.price_list_id
           WHERE pl.shop = ?`
        )
        .get(shop);
      return Number(row && row.c) || 0;
    },
  };

  const activityRepo = {
    append(log) {
      db.prepare(
        `INSERT INTO activity_logs
          (id, shop, actor, action, entity_type, entity_id, payload, created_at)
         VALUES (@id, @shop, @actor, @action, @entity_type, @entity_id, @payload, @created_at)`
      ).run({
        id: log.id,
        shop: log.shop,
        actor: log.actor,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        payload: log.payload == null ? null : JSON.stringify(log.payload),
        created_at: log.createdAt,
      });
      return log;
    },
    list(shop, { limit = 50 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      return db
        .prepare(
          `SELECT * FROM activity_logs WHERE shop = ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(shop, safeLimit)
        .map(mapActivity);
    },
  };

  return { priceListRepo, variantPriceRepo, activityRepo };
}

module.exports = { createRepositories };
