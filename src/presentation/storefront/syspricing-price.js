/**
 * SYSPRICING storefront — precios B2B para cliente logueado.
 */
(function () {
  function formatMoney(price, currency) {
    var n = Number(price);
    if (!Number.isFinite(n)) return String(price);
    var cur = String(currency || 'GTQ').toUpperCase();
    if (cur === 'GTQ') return 'Q' + n.toFixed(2);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n);
    } catch (_) {
      return cur + ' ' + n.toFixed(2);
    }
  }

  function pickPrice(prices, variantId) {
    if (!prices || !variantId) return null;
    var id = String(variantId);
    if (prices[id]) return prices[id];
    var numeric = id.indexOf('/') >= 0 ? id.split('/').pop() : id;
    if (prices[numeric]) return prices[numeric];
    var gid = 'gid://shopify/ProductVariant/' + numeric;
    return prices[gid] || null;
  }

  function replaceCatalogPrice(root, formatted) {
    var scopes = [];
    if (root.parentElement) scopes.push(root.parentElement);
    var form = root.closest('form[action*="/cart/add"], product-form, .product-form, .product__info');
    if (form) scopes.push(form);
    scopes.push(document);

    for (var s = 0; s < scopes.length; s++) {
      var nodes = scopes[s].querySelectorAll(
        '.price, .price__regular, .price-item--regular, [data-product-price], .product__price'
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.closest('#syspricing-b2b-price, .syspricing-b2b-price')) continue;
        if (el.children.length > 2) continue;
        el.textContent = formatted;
      }
      if (nodes.length) break;
    }
  }

  function boot(root) {
    if (!root || root.getAttribute('data-logged-in') !== '1') return;
    if (root.getAttribute('data-syspricing-booted') === '1') return;
    root.setAttribute('data-syspricing-booted', '1');

    var proxy = root.getAttribute('data-proxy') || '/apps/syspricing/prices';
    var tags = root.getAttribute('data-customer-tags') || '';
    var amountEl = root.querySelector('.syspricing-amount');
    var tagEl = root.querySelector('.syspricing-tag');
    var statusEl = root.querySelector('.syspricing-status');
    var lastInfo = null;

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.display = msg ? 'block' : 'none';
      statusEl.style.color = isError ? '#d72c0d' : '#6d7175';
    }

    function applyPrice(info) {
      lastInfo = info;
      if (!info || info.price == null || info.price === '') {
        setStatus('No hay precio especial para este producto', true);
        return;
      }
      var formatted = formatMoney(info.price, info.currency);
      if (amountEl) amountEl.textContent = formatted;
      if (tagEl && info.matchedTag) tagEl.textContent = '(' + info.matchedTag + ')';
      setStatus('');
      root.removeAttribute('hidden');
      root.hidden = false;
      replaceCatalogPrice(root, formatted);
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
          if (!r.ok) throw new Error('No se pudo cargar el precio');
          return r.json();
        })
        .then(function (body) {
          var prices = (body && body.data && body.data.prices) || {};
          if (body && body.error) {
            setStatus('No se pudo cargar el precio', true);
            return;
          }
          applyPrice(pickPrice(prices, variantId));
          setTimeout(function () {
            if (lastInfo) applyPrice(lastInfo);
          }, 400);
          setTimeout(function () {
            if (lastInfo) applyPrice(lastInfo);
          }, 1200);
        })
        .catch(function () {
          setStatus('No se pudo cargar el precio', true);
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
    var nodes = document.querySelectorAll('#syspricing-b2b-price, .syspricing-b2b-price');
    for (var i = 0; i < nodes.length; i++) boot(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
