/**
 * SYSPRICING storefront — catalog (line-through) + B2B side by side.
 * Works on PDP (.syspricing-b2b-price) and collection cards (.syspricing-grid-item).
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

  function formatCompareMoney(cents, currency) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return '';
    return formatMoney(n / 100, currency);
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

  function setCatalogFallbackVisible(root, visible) {
    var wrap = root.closest('.syspricing-price-wrap');
    if (!wrap) return;
    var fallback = wrap.querySelector('.syspricing-catalog-fallback');
    if (!fallback) return;
    fallback.style.display = visible ? '' : 'none';
  }

  function findCardPriceNode(item) {
    var selectors = [
      '.price',
      '.product-item__price',
      '.product-price',
      '.card-price',
      '[data-product-price]',
      '.price__regular',
      '.price-item--regular'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = item.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function applyGridItem(item) {
    if (!item || item.getAttribute('data-syspricing-grid-booted') === '1') return;
    if (item.getAttribute('data-has-b2b') !== '1') return;
    item.setAttribute('data-syspricing-grid-booted', '1');

    var b2b = item.getAttribute('data-b2b-price');
    var tag = item.getAttribute('data-b2b-tag') || '';
    var compareRaw = item.getAttribute('data-compare-price') || '';
    if (b2b == null || b2b === '') return;

    var priceNode = findCardPriceNode(item);
    if (!priceNode) return;

    var compareText = formatCompareMoney(compareRaw, 'GTQ');
    var b2bText = formatMoney(Number(b2b), 'GTQ');
    var html =
      '<span class="syspricing-card-price">' +
      (compareText ? '<span class="syspricing-compare">' + compareText + '</span> ' : '') +
      '<span class="syspricing-amount">' +
      b2bText +
      '</span>' +
      (tag ? ' <span class="syspricing-tag">(' + tag + ')</span>' : '') +
      '</span>';
    priceNode.innerHTML = html;
  }

  function bootGrid() {
    var items = document.querySelectorAll('.syspricing-grid-item[data-has-b2b="1"]');
    for (var i = 0; i < items.length; i++) applyGridItem(items[i]);
  }

  function boot(root) {
    if (!root || root.getAttribute('data-logged-in') !== '1') return;
    if (root.getAttribute('data-syspricing-booted') === '1') return;
    root.setAttribute('data-syspricing-booted', '1');

    var proxy = root.getAttribute('data-proxy') || '/apps/syspricing/prices';
    var tags = root.getAttribute('data-customer-tags') || '';
    var currency = root.getAttribute('data-currency') || 'GTQ';
    var compareRaw = root.getAttribute('data-compare-price') || '';
    var amountEl = root.querySelector('.syspricing-amount');
    var tagEl = root.querySelector('.syspricing-tag');
    var compareEl = root.querySelector('.syspricing-compare');
    var statusEl = root.querySelector('.syspricing-status');
    var lastInfo = null;

    function clearStatus() {
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }

    function hideB2b() {
      lastInfo = null;
      clearStatus();
      if (amountEl) amountEl.textContent = '';
      if (tagEl) tagEl.textContent = '';
      if (compareEl) {
        compareEl.textContent = '';
        compareEl.setAttribute('hidden', '');
      }
      root.setAttribute('hidden', '');
      root.hidden = true;
      setCatalogFallbackVisible(root, true);
    }

    function applyPrice(info) {
      if (!info || info.price == null || info.price === '') {
        hideB2b();
        return;
      }
      lastInfo = info;
      var formatted = formatMoney(info.price, info.currency || currency);
      if (amountEl) amountEl.textContent = formatted;
      if (tagEl) tagEl.textContent = info.matchedTag ? '(' + info.matchedTag + ')' : '';
      if (compareEl) {
        var compareText = formatCompareMoney(compareRaw, info.currency || currency);
        if (compareText) {
          compareEl.textContent = compareText;
          compareEl.removeAttribute('hidden');
        } else {
          compareEl.setAttribute('hidden', '');
        }
      }
      clearStatus();
      root.removeAttribute('hidden');
      root.hidden = false;
      setCatalogFallbackVisible(root, false);
    }

    function loadForVariant(variantId, comparePrice) {
      if (!variantId) return;
      if (comparePrice != null && comparePrice !== '') {
        compareRaw = String(comparePrice);
        root.setAttribute('data-compare-price', compareRaw);
      }
      clearStatus();
      var params = new URLSearchParams();
      params.set('variant_ids', String(variantId));
      if (tags) params.set('tags', tags);

      var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();

      fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('proxy');
          return r.json();
        })
        .then(function (body) {
          if (body && body.error) {
            hideB2b();
            return;
          }
          var prices = (body && body.data && body.data.prices) || {};
          applyPrice(pickPrice(prices, variantId));
          setTimeout(function () {
            if (lastInfo) applyPrice(lastInfo);
          }, 400);
          setTimeout(function () {
            if (lastInfo) applyPrice(lastInfo);
          }, 1200);
        })
        .catch(function () {
          hideB2b();
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
        loadForVariant(v.id, v.price);
        root.setAttribute('data-variant-id', v.id);
      }
    });
  }

  function init() {
    var nodes = document.querySelectorAll('#syspricing-b2b-price, .syspricing-b2b-price');
    for (var i = 0; i < nodes.length; i++) boot(nodes[i]);
    bootGrid();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Facets / infinite loads often replace the grid
  document.addEventListener('shopify:section:load', init);
  var grid = document.getElementById('CollectionProductGrid');
  if (grid && window.MutationObserver) {
    var t = null;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(bootGrid, 80);
    }).observe(grid, { childList: true, subtree: true });
  }
})();
