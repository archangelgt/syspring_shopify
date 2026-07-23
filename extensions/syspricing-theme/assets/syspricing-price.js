/**
 * SYSPRICING storefront — App Proxy + Liquid tags fallback
 * (New Customer Accounts often omit logged_in_customer_id on proxy).
 */
(function () {
  function boot(root) {
    if (!root || root.getAttribute('data-logged-in') !== '1') return;

    var proxy = root.getAttribute('data-proxy') || '/apps/syspricing/prices';
    var tags = root.getAttribute('data-customer-tags') || '';
    var amountEl = root.querySelector('.syspricing-amount');
    var tagEl = root.querySelector('.syspricing-tag');
    var statusEl = root.querySelector('.syspricing-status');

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.display = msg ? 'block' : 'none';
      statusEl.style.color = isError ? '#d72c0d' : '#6d7175';
    }

    function applyPrice(info) {
      if (!info || !info.price) {
        setStatus('Sin precio B2B para tus tags en esta variante (cárgalo en Variant Pricing)', true);
        console.warn('[SYSPRICING] No B2B price', info);
        return;
      }
      var formatted = 'Q' + Number(info.price).toFixed(2);
      if (amountEl) amountEl.textContent = formatted;
      if (tagEl && info.matchedTag) tagEl.textContent = '(' + info.matchedTag + ')';
      setStatus('');
      root.hidden = false;

      var priceNode = root.parentElement && root.parentElement.querySelector('.price');
      if (priceNode) priceNode.textContent = formatted;
    }

    function loadForVariant(variantId) {
      if (!variantId) return;
      setStatus('Cargando precio…', false);
      var params = new URLSearchParams();
      params.set('variant_ids', String(variantId));
      if (tags) params.set('tags', tags);

      var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();

      fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' — revisa App Proxy');
          return r.json();
        })
        .then(function (body) {
          console.info('[SYSPRICING]', body);
          if (body && body.error) {
            setStatus(body.error.message || 'Error proxy', true);
            return;
          }
          var prices = (body && body.data && body.data.prices) || {};
          applyPrice(prices[String(variantId)] || null);
        })
        .catch(function (err) {
          console.error('[SYSPRICING]', err);
          setStatus((err && err.message) || 'Error al cargar precio', true);
        });
    }

    loadForVariant(root.getAttribute('data-variant-id'));

    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && (t.name === 'id' || t.getAttribute('name') === 'id')) {
        loadForVariant(t.value);
        root.setAttribute('data-variant-id', t.value);
      }
    });

    document.addEventListener('variant:change', function (ev) {
      var v = ev.detail && (ev.detail.variant || ev.detail);
      if (v && v.id) {
        loadForVariant(v.id);
        root.setAttribute('data-variant-id', v.id);
      }
    });
  }

  function init() {
    boot(document.getElementById('syspricing-b2b-price'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
