import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

export default async () => {
  render(<ExportExtension />, document.body);
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

async function fetchProducts(ids) {
  const query = `#graphql
    query SyspricingExportProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
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
  `;

  if (typeof shopify.query === 'function') {
    const result = await shopify.query(query, { variables: { ids } });
    return result?.data?.nodes || [];
  }

  const response = await fetch('shopify:admin/api/2025-10/graphql.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { ids } }),
  });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'GraphQL error');
  }
  return json.data?.nodes || [];
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

function ExportExtension() {
  const { close, data, i18n } = shopify;
  const selected = data?.selected || [];
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [csv, setCsv] = useState('');
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const productIds = useMemo(
    () => selected.map((item) => item.id).filter(Boolean).slice(0, 100),
    [selected]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!productIds.length) {
          setStatus('empty');
          setCount(0);
          setCsv('product_id,variant_id,variant_name,sku,original_price');
          return;
        }
        const nodes = await fetchProducts(productIds);
        const { rows, priceCount, variantCount } = buildMatrix(nodes);
        if (cancelled) return;
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
  }, [productIds]);

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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syspricing-individual-pricing-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const heading = i18n.translate('title');
  const body =
    status === 'loading'
      ? i18n.translate('loading')
      : status === 'error'
        ? error || i18n.translate('error')
        : status === 'empty'
          ? i18n.translate('empty')
          : i18n.translate('ready', { count: String(count) });

  return (
    <s-admin-action heading={heading}>
      <s-stack direction="block" gap="base">
        <s-text>{i18n.translate('description')}</s-text>
        <s-text>
          {selected.length} product(s) · {body}
        </s-text>
        {status === 'ready' || status === 'empty' ? (
          <s-box padding="base" border="base" borderRadius="base">
            <s-text>
              {csv.slice(0, 1500)}
              {csv.length > 1500 ? ' …' : ''}
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
