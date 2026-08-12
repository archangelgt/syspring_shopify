/**
 * SYSPRICING storefront — catalog (line-through) + B2B side by side.
 * PDP: .syspricing-b2b-price | Collection: .syspricing-grid-item (+ proxy batch)
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
      '.price-item--regular',
      '.product-item-price',
      '.product__price'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = item.querySelector(selectors[i]);
      if (el) return el;
    }
    var candidates = item.querySelectorAll('span, div, p, b, strong');
    for (var j = 0; j < candidates.length; j++) {
      var node = candidates[j];
      if (node.children && node.children.length) continue;
      var t = String(node.textContent || '').trim();
      if (/^Q\s*[\d.,]+$/.test(t) || /^[\d.,]+\s*GTQ$/i.test(t)) return node;
    }
    return null;
  }

  function paintCard(item, b2bPrice, tag, currency) {
    var priceNode = findCardPriceNode(item);
    if (!priceNode) return false;
    var compareRaw = item.getAttribute('data-compare-price') || '';
    var compareText = formatCompareMoney(compareRaw, currency);
    var b2bText = formatMoney(Number(b2bPrice), currency);
    priceNode.innerHTML =
      '<span class="syspricing-card-price">' +
      (compareText ? '<span class="syspricing-compare">' + compareText + '</span> ' : '') +
      '<span class="syspricing-amount">' +
      b2bText +
      '</span>' +
      (tag ? ' <span class="syspricing-tag">(' + tag + ')</span>' : '') +
      '</span>';
    item.setAttribute('data-has-b2b', '1');
    item.classList.add('syspricing-grid-item--b2b');
    return true;
  }

  function applyGridItemFromData(item, currency) {
    if (!item || item.getAttribute('data-syspricing-grid-painted') === '1') return;
    if (item.getAttribute('data-has-b2b') !== '1') return;
    var b2b = item.getAttribute('data-b2b-price');
    if (b2b == null || b2b === '') return;
    if (paintCard(item, b2b, item.getAttribute('data-b2b-tag') || '', currency || 'GTQ')) {
      item.setAttribute('data-syspricing-grid-painted', '1');
    }
  }

  function fetchGridPrices() {
    var boot = document.getElementById('syspricing-collection-boot');
    if (!boot || boot.getAttribute('data-logged-in') !== '1') return;

    var items = document.querySelectorAll('.syspricing-grid-item[data-variant-id]');
    if (!items.length) return;

    var currency = boot.getAttribute('data-currency') || 'GTQ';
    var tags = boot.getAttribute('data-customer-tags') || '';
    var proxy = boot.getAttribute('data-proxy') || '/apps/syspricing/prices';

    // Instant paint from Liquid metafields when present
    for (var i = 0; i < items.length; i++) applyGridItemFromData(items[i], currency);

    var ids = [];
    for (var j = 0; j < items.length; j++) {
      var id = items[j].getAttribute('data-variant-id');
      if (id) ids.push(id);
    }
    if (!ids.length) return;

    var params = new URLSearchParams();
    params.set('variant_ids', ids.join(','));
    if (tags) params.set('tags', tags);
    var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();

    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('proxy');
        return r.json();
      })
      .then(function (body) {
        var prices = (body && body.data && body.data.prices) || {};
        for (var k = 0; k < items.length; k++) {
          var item = items[k];
          var vid = item.getAttribute('data-variant-id');
          var info = pickPrice(prices, vid);
          if (!info || info.price == null || info.price === '') continue;
          if (
            paintCard(
              item,
              info.price,
              info.matchedTag || item.getAttribute('data-b2b-tag') || '',
              info.currency || currency
            )
          ) {
            item.setAttribute('data-syspricing-grid-painted', '1');
            item.setAttribute('data-b2b-price', String(info.price));
            if (info.matchedTag) item.setAttribute('data-b2b-tag', info.matchedTag);
          }
        }
      })
      .catch(function () {});
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
    fetchGridPrices();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', init);
  var grid = document.getElementById('CollectionProductGrid');
  if (grid && window.MutationObserver) {
    var t = null;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(fetchGridPrices, 120);
    }).observe(grid, { childList: true, subtree: true });
  }
})();
