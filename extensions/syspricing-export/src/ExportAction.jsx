import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

export default async () => {
  render(<ExportExtension />, document.body);
};

function numericVariantId(gid) {
  return String(gid || '').replace(/^gid:\/\/shopify\/ProductVariant\//, '');
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
              sku
              metafield(namespace: "syspricing", key: "prices") {
                value
              }
            }
          }
        }
      }
    }
  `;

  // Prefer shopify.query when available; fall back to admin GraphQL fetch.
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
          setCsv('sku,variant_id,tag,price');
          return;
        }
        const nodes = await fetchProducts(productIds);
        const rows = [['sku', 'variant_id', 'tag', 'price']];
        let n = 0;
        for (const product of nodes) {
          if (!product?.id) continue;
          const variants = product.variants?.nodes || [];
          for (const variant of variants) {
            let prices = {};
            try {
              prices = variant.metafield?.value
                ? JSON.parse(variant.metafield.value)
                : {};
            } catch (_err) {
              prices = {};
            }
            const variantId = numericVariantId(variant.id);
            for (const [tag, price] of Object.entries(prices || {})) {
              if (!tag || price == null || price === '') continue;
              rows.push([variant.sku || '', variantId, tag, String(price)]);
              n += 1;
            }
          }
        }
        if (cancelled) return;
        setCsv(buildCsv(rows));
        setCount(n);
        setStatus(n ? 'ready' : 'empty');
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
    a.download = `syspricing-export-${Date.now()}.csv`;
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
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: '220px', overflow: 'auto' }}>
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
        disabled={status !== 'ready'}
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
