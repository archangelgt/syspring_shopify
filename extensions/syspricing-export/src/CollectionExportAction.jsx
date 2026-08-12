import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

export default async () => {
  render(<CollectionExportExtension />, document.body);
};

function numericId(gid) {
  return String(gid || '').replace(/^gid:\/\/shopify\/[^/]+\//, '');
}

function escapeCsv(value) {
  const s = String(value == null ? '' : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows) {
  return rows.map((cols) => cols.map(escapeCsv).join(',')).join('\n');
}

async function graphql(query, variables) {
  if (typeof shopify.query === 'function') {
    const result = await shopify.query(query, { variables });
    if (result?.errors?.length) {
      throw new Error(result.errors[0].message || 'GraphQL error');
    }
    return result?.data;
  }

  const response = await fetch('shopify:admin/api/2025-10/graphql.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'GraphQL error');
  }
  return json.data;
}

async function fetchCollectionProducts(collectionId, maxProducts = 2500) {
  const query = `#graphql
    query SyspricingCollectionExport($id: ID!, $first: Int!, $after: String) {
      collection(id: $id) {
        id
        title
        handle
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            variants(first: 100) {
              nodes {
                id
                title
                displayName
                sku
                price
                metafield(namespace: "syspricing", key: "prices") {
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const products = [];
  let cursor = null;
  let meta = null;
  let guard = 0;

  while (products.length < maxProducts && guard < 100) {
    guard += 1;
    const data = await graphql(query, {
      id: collectionId,
      first: 50,
      after: cursor,
    });
    const coll = data?.collection;
    if (!coll) throw new Error('Collection not found');
    if (!meta) meta = { id: coll.id, title: coll.title, handle: coll.handle };
    for (const product of coll.products?.nodes || []) {
      products.push(product);
      if (products.length >= maxProducts) break;
    }
    if (!coll.products?.pageInfo?.hasNextPage) break;
    cursor = coll.products.pageInfo.endCursor;
  }

  return { meta, products };
}

function buildMatrix(nodes) {
  const fixed = ['product_id', 'variant_id', 'variant_name', 'sku', 'original_price'];
  const tagSet = new Set();
  const variants = [];

  for (const product of nodes) {
    if (!product?.id) continue;
    for (const variant of product.variants?.nodes || []) {
      let prices = {};
      try {
        prices = variant.metafield?.value ? JSON.parse(variant.metafield.value) : {};
      } catch (_err) {
        prices = {};
      }
      Object.keys(prices || {}).forEach((t) => tagSet.add(t));
      variants.push({
        productId: numericId(product.id),
        variantId: numericId(variant.id),
        variantName:
          variant.displayName ||
          (product.title && variant.title && variant.title !== 'Default Title'
            ? `${product.title} - ${variant.title}`
            : product.title || variant.title || ''),
        sku: variant.sku || '',
        originalPrice: variant.price != null ? String(variant.price) : '',
        prices: prices || {},
      });
    }
  }

  const tags = [...tagSet].sort((a, b) => a.localeCompare(b));
  const rows = [[...fixed, ...tags]];
  let priceCount = 0;
  for (const v of variants) {
    const row = [v.productId, v.variantId, v.variantName, v.sku, v.originalPrice];
    for (const tag of tags) {
      const val = v.prices[tag];
      if (val == null || val === '') row.push('');
      else {
        row.push(String(val));
        priceCount += 1;
      }
    }
    rows.push(row);
  }
  return { rows, priceCount, variantCount: variants.length };
}

function CollectionExportExtension() {
  const { close, data, i18n } = shopify;
  const selected = data?.selected || [];
  const collectionId = useMemo(() => selected[0]?.id || '', [selected]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [csv, setCsv] = useState('');
  const [count, setCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!collectionId) {
          setStatus('empty');
          setCsv('product_id,variant_id,variant_name,sku,original_price');
          return;
        }
        const { meta, products } = await fetchCollectionProducts(collectionId);
        const { rows, priceCount, variantCount } = buildMatrix(products);
        if (cancelled) return;
        setTitle(meta?.title || '');
        setProductCount(products.length);
        setCsv(buildCsv(rows));
        setCount(priceCount);
        setStatus(variantCount ? (priceCount ? 'ready' : 'empty') : 'empty');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || String(err));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_err) {
      setError(i18n.translate('error'));
    }
  }

  function onDownload() {
    const slug = String(title || 'collection')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'collection';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syspricing-individual-pricing-${slug}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const body =
    status === 'loading'
      ? i18n.translate('loading')
      : status === 'error'
        ? error || i18n.translate('error')
        : status === 'empty'
          ? i18n.translate('empty')
          : i18n.translate('ready', { count: String(count) });

  return (
    <s-admin-action heading={i18n.translate('collectionTitle')}>
      <s-stack direction="block" gap="base">
        <s-text>{i18n.translate('collectionDescription')}</s-text>
        <s-text>
          {title || i18n.translate('collectionFallback')} · {productCount} product(s) · {body}
        </s-text>
        {status === 'ready' || status === 'empty' ? (
          <s-box padding="base" border="base" borderRadius="base">
            <s-text>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 'min(40vh, 220px)', overflow: 'auto', WebkitOverflowScrolling: 'touch', fontSize: '0.8rem' }}>
                {csv.slice(0, 5000)}
                {csv.length > 5000 ? '\n…' : ''}
              </pre>
            </s-text>
          </s-box>
        ) : null}
      </s-stack>

      <s-button
        slot="primary-action"
        variant="primary"
        disabled={status === 'loading' || status === 'error'}
        onClick={onDownload}
      >
        {i18n.translate('download')}
      </s-button>
      <s-button
        slot="secondary-actions"
        disabled={status === 'loading' || status === 'error'}
        onClick={onCopy}
      >
        {copied ? i18n.translate('copied') : i18n.translate('copy')}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => close()}>
        {i18n.translate('cancel')}
      </s-button>
    </s-admin-action>
  );
}
