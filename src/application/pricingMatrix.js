'use strict';

/**
 * WPD-compatible individual pricing matrix:
 * product_id, variant_id, variant_name, sku, original_price, <TAG>...
 */
const XLSX = require('xlsx');
const { numericId } = require('../infrastructure/shopify/productsAdmin');

const FIXED_HEADERS = ['product_id', 'variant_id', 'variant_name', 'sku', 'original_price'];

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isMatrixHeaders(headers) {
  const norm = headers.map(normalizeHeader);
  const hasVariant = norm.includes('variant_id');
  const hasTagCol = norm.includes('tag');
  const hasPriceCol = norm.includes('price') && !norm.includes('original_price');
  const hasOriginal = norm.includes('original_price');
  const hasProduct = norm.includes('product_id');
  // Wide WPD matrix: product/variant + tag columns (no dedicated tag/price pair)
  if (hasVariant && hasProduct && !hasTagCol) return true;
  if (hasVariant && hasOriginal && !hasTagCol) return true;
  // Long format has explicit tag + price
  if (hasTagCol && hasPriceCol) return false;
  return false;
}

function tagColumnsFromHeaders(headers) {
  return headers.filter((h) => {
    const n = normalizeHeader(h);
    return n && !FIXED_HEADERS.includes(n) && n !== 'tag' && n !== 'price' && n !== 'compare_at_price';
  });
}

function buildPriceLookup(variantPriceRepo, priceListRepo, shop, variantIds) {
  const lists = priceListRepo.list(shop);
  const listById = new Map(lists.map((pl) => [pl.id, pl]));
  const keys = [];
  for (const id of variantIds) {
    const gid = String(id);
    const num = numericId(gid);
    keys.push(gid, num);
  }
  const existing = variantPriceRepo.listByVariantIds(shop, [...new Set(keys)]);
  const byVariantTag = new Map();
  for (const vp of existing) {
    const pl = listById.get(vp.priceListId);
    if (!pl?.tag) continue;
    const num = numericId(vp.shopifyVariantId);
    const gid = String(vp.shopifyVariantId);
    for (const key of [num, gid]) {
      if (!byVariantTag.has(key)) byVariantTag.set(key, {});
      byVariantTag.get(key)[pl.tag] = vp.price;
    }
  }
  return { lists, byVariantTag };
}

function collectTagOrder(lists, byVariantTag, products) {
  const tags = new Set(lists.map((pl) => pl.tag).filter(Boolean));
  for (const map of byVariantTag.values()) {
    Object.keys(map || {}).forEach((t) => tags.add(t));
  }
  for (const p of products) {
    for (const v of p.variants || []) {
      Object.keys(v.pricesByTag || {}).forEach((t) => tags.add(t));
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function buildMatrixRows(products, tagOrder, byVariantTag) {
  const header = [...FIXED_HEADERS, ...tagOrder];
  const rows = [header];
  let priceCount = 0;

  for (const product of products) {
    const productId = numericId(product.id);
    for (const variant of product.variants || []) {
      const variantId = numericId(variant.id);
      const fromDb = byVariantTag.get(variantId) || byVariantTag.get(String(variant.id)) || {};
      const fromMeta = variant.pricesByTag || {};
      const merged = { ...fromMeta, ...fromDb };
      const variantName =
        variant.displayName ||
        (product.title && variant.title && variant.title !== 'Default Title'
          ? `${product.title} - ${variant.title}`
          : product.title || variant.title || '');

      const row = [
        productId,
        variantId,
        variantName,
        variant.sku || '',
        variant.price != null ? String(variant.price) : '',
      ];
      for (const tag of tagOrder) {
        const val = merged[tag];
        if (val == null || val === '') {
          row.push('');
        } else {
          row.push(String(val));
          priceCount += 1;
        }
      }
      rows.push(row);
    }
  }

  return { rows, priceCount, tagOrder };
}

function rowsToCsv(rows) {
  return rows
    .map((cols) =>
      cols
        .map((c) => {
          const s = String(c == null ? '' : c);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
}

function rowsToXlsxBuffer(rows, sheetName = 'Individual_Price') {
  // Force IDs/text as strings so Excel does not convert to scientific notation.
  const aoa = rows.map((cols, rowIdx) =>
    cols.map((c, colIdx) => {
      if (c == null || c === '') return '';
      if (rowIdx === 0) return String(c);
      if (colIdx <= 3) return String(c); // product_id, variant_id, variant_name, sku
      const n = Number(c);
      return Number.isFinite(n) && String(c).trim() !== '' ? n : String(c);
    })
  );
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false });
  // Mark id columns as text
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; R += 1) {
    for (const C of [0, 1, 3]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].t = 's';
      ws[addr].v = String(ws[addr].v ?? '');
      ws[addr].z = '@';
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function parseCsvText(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] != null ? String(cols[i]).trim() : '';
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cellToString(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isSafeInteger(v)) return String(v);
    if (Math.abs(v) >= 1e11) return v.toFixed(0);
    return String(v);
  }
  const s = String(v).trim();
  // Excel sometimes serializes big ids as 1.04403E+13
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && Number.isSafeInteger(n)) return String(n);
    if (Number.isFinite(n)) return n.toFixed(0);
  }
  return s;
}

function parseSpreadsheet({ csv, xlsxBase64, buffer }) {
  if (buffer && Buffer.isBuffer(buffer)) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!aoa.length) return { headers: [], rows: [], format: 'xlsx' };
    const headers = aoa[0].map((h) => cellToString(h));
    const rows = aoa
      .slice(1)
      .map((cols) => {
        const row = {};
        headers.forEach((h, i) => {
          if (!h) return;
          row[h] = cellToString(cols[i]);
        });
        return row;
      })
      .filter((row) => {
        const vid = row.variant_id || row.variantId || row.sku || row.SKU || row.tag || row.price;
        return Boolean(vid);
      });
    return { headers: headers.filter(Boolean), rows, format: 'xlsx' };
  }

  if (xlsxBase64) {
    const buf = Buffer.from(String(xlsxBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    return parseSpreadsheet({ buffer: buf });
  }

  const parsed = parseCsvText(csv);
  const rows = parsed.rows.filter((row) => {
    const keys = Object.keys(row);
    return keys.some((k) => String(row[k] || '').trim() !== '');
  });
  return { headers: parsed.headers, rows, format: 'csv' };
}

function matrixRowsToPriceUpserts(headers, rows, { normalizeTag, ensureList }) {
  const tagCols = tagColumnsFromHeaders(headers);
  const mapped = [];
  const errors = [];

  rows.forEach((r, idx) => {
    const variantId = r.variant_id || r.variantId || '';
    const productId = r.product_id || r.productId || '';
    const sku = r.sku || r.SKU || null;
    if (!variantId && !sku) {
      errors.push({ row: idx + 2, message: 'variant_id or sku required' });
      return;
    }
    for (const tagHeader of tagCols) {
      const raw = r[tagHeader];
      if (raw == null || String(raw).trim() === '') continue;
      const tag = normalizeTag(tagHeader);
      const list = ensureList(tag);
      if (!list) {
        errors.push({ row: idx + 2, message: `Unknown tag: ${tagHeader}`, tag: tagHeader });
        continue;
      }
      const price = Number(raw);
      if (!Number.isFinite(price)) {
        errors.push({ row: idx + 2, message: `Invalid price for ${tagHeader}`, data: raw });
        continue;
      }
      mapped.push({
        _priceListId: list.id,
        sku,
        shopifyVariantId: String(variantId),
        shopifyProductId: productId ? String(productId) : null,
        price,
        compareAtPrice: null,
      });
    }
  });

  return { mapped, errors };
}

module.exports = {
  FIXED_HEADERS,
  isMatrixHeaders,
  tagColumnsFromHeaders,
  buildPriceLookup,
  collectTagOrder,
  buildMatrixRows,
  rowsToCsv,
  rowsToXlsxBuffer,
  parseSpreadsheet,
  matrixRowsToPriceUpserts,
  parseCsvText,
};
