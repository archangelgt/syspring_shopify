'use strict';

/**
 * Smoke test — tag-driven price lists (no Shopify credentials).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/infrastructure/db/sqlite');
const { createRepositories } = require('../src/infrastructure/repositories/sqliteRepositories');
const { createUseCases, parseCsv } = require('../src/application/useCases');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'syspricing-'));
  const db = await openDatabase(tmp);
  const repos = createRepositories(db);
  const useCases = createUseCases({
    ...repos,
    metafieldSync: null,
    customersAdmin: null,
    productsAdmin: null,
  });
  const shop = 'demo.myshopify.com';

  const list = await useCases.priceLists.create(shop, {
    tag: 'DPAÑUELOS',
    name: 'Distribuidores Pañuelos',
    currency: 'GTQ',
    status: 'active',
    priority: 10,
  });
  await useCases.priceLists.create(shop, {
    tag: 'MPAÑUELOS',
    currency: 'GTQ',
    status: 'active',
    priority: 5,
  });

  const csv = `sku,variant_id,tag,price
ABC-1,gid://shopify/ProductVariant/111,DPAÑUELOS,335
ABC-1,gid://shopify/ProductVariant/111,MPAÑUELOS,360`;
  const parsed = parseCsv(csv);
  if (parsed.length !== 2) throw new Error('CSV parse failed');

  const imported = await useCases.importCsv.run(shop, csv);
  if (imported.created !== 2) throw new Error(`expected 2 created, got ${imported.created}`);

  // Multi-tag: higher priority DPAÑUELOS wins → 335
  const resolved = useCases.resolve.run(shop, {
    tags: ['MPAÑUELOS', 'DPAÑUELOS'],
    shopifyVariantId: 'gid://shopify/ProductVariant/111',
  });
  if (resolved.reason !== 'ok' || resolved.price !== '335.00' || resolved.matchedTag !== 'DPAÑUELOS') {
    throw new Error(`resolve failed: ${JSON.stringify(resolved)}`);
  }

  const matrix = await useCases.prices.upsertMatrix(shop, [
    {
      tag: 'DPAÑUELOS',
      variantId: 'gid://shopify/ProductVariant/222',
      sku: 'X',
      price: '100',
    },
  ]);
  if (matrix.created !== 1) throw new Error('matrix upsert failed');

  const logs = useCases.activity.list(shop, 20);
  if (!logs.length) throw new Error('expected activity logs');

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('smoke ok', {
    tag: list.tag,
    price: resolved.price,
    matchedTag: resolved.matchedTag,
    logs: logs.length,
  });
}

main().catch((err) => {
  console.error('smoke failed', err);
  process.exit(1);
});
