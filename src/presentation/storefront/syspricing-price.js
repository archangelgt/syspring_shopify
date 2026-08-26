/**
 * SYSPRICING storefront — catalog (line-through) + B2B side by side.
 * PDP: .syspricing-b2b-price | Collection: .syspricing-grid-item (+ proxy batch)
 * Cart drawer / cart page: rewrite catalog amounts to B2B.
 */
(function () {
  if (window.__SYSPRICING_PRICE_BOOTED) return;
  window.__SYSPRICING_PRICE_BOOTED = true;
  var session = { loggedIn: false, customerId: null };
  var lastB2bCartTotal = null;
  var lastCatalogCartTotal = null;
  function formatMoney(price, currency) {
    var n = Number(price);
    if (!Number.isFinite(n)) return String(price);
    var cur = String(currency || 'GTQ').toUpperCase();
    var parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (cur === 'GTQ') return 'Q' + parts.join('.');
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n);
    } catch (_) {
      return cur + ' ' + parts.join('.');
    }
  }

  function parseMoneyText(text) {
    var t = String(text || '')
      .replace(/\s+/g, '')
      .replace(/^Total:/i, '')
      .replace(/^[Qq]/, '')
      .replace(/GTQ$/i, '');
    if (!t || !/\d/.test(t)) return NaN;
    var lastComma = t.lastIndexOf(',');
    var lastDot = t.lastIndexOf('.');
    if (lastComma > lastDot && /,\d{1,2}$/.test(t)) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
    t = t.replace(/[^\d.-]/g, '');
    return Number(t);
  }

  function amountsEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.009;
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

  function getBoot() {
    return (
      document.getElementById('syspricing-cart-boot') ||
      document.getElementById('syspricing-collection-boot') ||
      document.querySelector('#syspricing-b2b-price, .syspricing-b2b-price')
    );
  }

  function rememberSession(body) {
    var data = (body && body.data) || {};
    session.customerId = data.customerId || null;
    session.loggedIn = Boolean(data.customerId) || data.loggedIn === true;
    return data;
  }

  function fetchProxyPrices(variantIds) {
    var boot = getBoot();
    var proxy = (boot && boot.getAttribute('data-proxy')) || '/apps/syspricing/prices';
    var params = new URLSearchParams();
    params.set('variant_ids', variantIds.join(','));
    var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    return fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }).then(function (r) {
      if (!r.ok) throw new Error('proxy');
      return r.json();
    }).then(function (body) {
      rememberSession(body);
      return body;
    });
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

  function rememberCatalogHtml(item, priceNode) {
    if (!item || !priceNode) return;
    if (item.getAttribute('data-syspricing-catalog-html') != null) return;
    item.setAttribute('data-syspricing-catalog-html', priceNode.innerHTML);
  }

  function restoreCard(item) {
    if (!item) return;
    var priceNode = findCardPriceNode(item);
    var html = item.getAttribute('data-syspricing-catalog-html');
    if (priceNode && html != null) priceNode.innerHTML = html;
    item.removeAttribute('data-has-b2b');
    item.removeAttribute('data-syspricing-grid-painted');
    item.removeAttribute('data-b2b-price');
    item.removeAttribute('data-b2b-tag');
    item.classList.remove('syspricing-grid-item--b2b');
  }

  function restoreCartPrices() {
    var dups = document.querySelectorAll('[data-syspricing-dup-hidden]');
    for (var d = 0; d < dups.length; d++) {
      var hidden = dups[d];
      hidden.style.display = hidden.getAttribute('data-syspricing-dup-display') || '';
      hidden.removeAttribute('data-syspricing-dup-hidden');
      hidden.removeAttribute('data-syspricing-dup-display');
    }
    var nodes = document.querySelectorAll('.syspricing-cart-price');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var compare = el.querySelector('.syspricing-compare');
      var text = compare ? String(compare.textContent || '').trim() : '';
      el.removeAttribute('data-syspricing-cart-painted');
      el.classList.remove('syspricing-cart-price');
      if (text) el.textContent = text;
    }
    var rows = document.querySelectorAll('[data-syspricing-row-painted]');
    for (var r = 0; r < rows.length; r++) {
      rows[r].removeAttribute('data-syspricing-row-painted');
    }
  }

  function paintCard(item, b2bPrice, tag, currency) {
    var priceNode = findCardPriceNode(item);
    if (!priceNode) return false;
    rememberCatalogHtml(item, priceNode);
    var compareRaw = item.getAttribute('data-compare-price') || '';
    var compareText = formatCompareMoney(compareRaw, currency);
    var b2bText = formatMoney(Number(b2bPrice), currency);
    priceNode.innerHTML =
      '<span class="syspricing-card-price">' +
      (compareText ? '<span class="syspricing-compare">' + compareText + '</span> ' : '') +
      '<span class="syspricing-amount">' +
      b2bText +
      '</span>' +
      ' <span class="syspricing-tag">Precio Especial</span>' +
      '</span>';
    item.setAttribute('data-has-b2b', '1');
    item.classList.add('syspricing-grid-item--b2b');
    return true;
  }

  function fetchGridPrices() {
    var boot = getBoot();
    var items = document.querySelectorAll('.syspricing-grid-item[data-variant-id]');
    if (!items.length) return Promise.resolve(false);

    var currency = (boot && boot.getAttribute('data-currency')) || 'GTQ';
    var ids = [];
    for (var j = 0; j < items.length; j++) {
      var id = items[j].getAttribute('data-variant-id');
      if (id) ids.push(id);
    }
    if (!ids.length) return Promise.resolve(false);

    return fetchProxyPrices(ids).then(function (body) {
      var prices = (body && body.data && body.data.prices) || {};
      var hasAny = false;
      for (var k = 0; k < items.length; k++) {
        var item = items[k];
        var vid = item.getAttribute('data-variant-id');
        var info = pickPrice(prices, vid);
        if (!info || info.price == null || info.price === '') {
          restoreCard(item);
          continue;
        }
        hasAny = true;
        if (
          paintCard(
            item,
            info.price,
            info.matchedTag || '',
            info.currency || currency
          )
        ) {
          item.setAttribute('data-syspricing-grid-painted', '1');
          item.setAttribute('data-b2b-price', String(info.price));
          if (info.matchedTag) item.setAttribute('data-b2b-tag', info.matchedTag);
        }
      }
      return hasAny || session.loggedIn;
    }).catch(function () {
      return false;
    });
  }

  function boot(root) {
    if (!root) return;
    if (root.getAttribute('data-syspricing-booted') === '1') {
      if (root._syspricingReload) root._syspricingReload();
      return;
    }
    root.setAttribute('data-syspricing-booted', '1');

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
      if (tagEl) tagEl.textContent = 'Precio Especial';
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
      if (!variantId) return Promise.resolve(false);
      if (comparePrice != null && comparePrice !== '') {
        compareRaw = String(comparePrice);
        root.setAttribute('data-compare-price', compareRaw);
      }
      clearStatus();
      return fetchProxyPrices([String(variantId)])
        .then(function (body) {
          if (body && body.error) {
            hideB2b();
            return false;
          }
          var prices = (body && body.data && body.data.prices) || {};
          var info = pickPrice(prices, variantId);
          applyPrice(info);
          return Boolean(info);
        })
        .catch(function () {
          hideB2b();
          return false;
        });
    }

    root._syspricingReload = function () {
      loadForVariant(root.getAttribute('data-variant-id'));
    };

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

  function getCartBoot() {
    return getBoot();
  }

  function looksLikeMoneyText(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return /^(Q\s*)?[\d.,]+\s*(GTQ)?$/i.test(t) && /[.,]\d{2}$/.test(t.replace(/\s+/g, ''));
  }

  function isHiddenEl(el) {
    if (!el) return true;
    if (el.hasAttribute && (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true')) return true;
    if (el.classList && (el.classList.contains('ymq-b2b-price-hidden') || el.classList.contains('visually-hidden') || el.classList.contains('hidden') || el.classList.contains('sr-only'))) return true;
    if (el.closest && el.closest('.ymq-b2b-price-hidden, [hidden], .visually-hidden, .sr-only')) return true;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return true;
    try {
      var cs = window.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
    } catch (_) {}
    return false;
  }

  function moneyLeafNodes(root, includeHidden) {
    if (!root) return [];
    var nodes = root.querySelectorAll('span, div, p, b, strong, td, em, small, a, h2, h3, h4');
    var hits = [];
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (el.closest && el.closest('.syspricing-card-price, .syspricing-b2b-price, .syspricing-cart-price, .syspricing-compare, .syspricing-amount')) continue;
      if (el.closest && el.closest('.quantity, .qty, [data-quantity-input], input, textarea, button')) continue;
      if (el.children && el.children.length) continue;
      if (!includeHidden && isHiddenEl(el)) continue;
      if (!looksLikeMoneyText(el.textContent)) continue;
      var n = parseMoneyText(el.textContent);
      if (Number.isFinite(n) && n > 0) hits.push({ el: el, amount: n });
    }
    return hits;
  }

  function paintMoneyNode(el, catalogMajor, b2bMajor, currency) {
    if (!el) return;
    if (el.closest && el.closest('.syspricing-card-price, .syspricing-b2b-price')) return;
    var host = el.classList && el.classList.contains('syspricing-cart-price') ? el : el;
    if (host.closest && host.closest('.syspricing-cart-price') && !host.classList.contains('syspricing-cart-price')) return;
    var catalogText = formatMoney(catalogMajor, currency);
    var b2bText = formatMoney(b2bMajor, currency);
    if (catalogText === b2bText) return;
    var existing = el.querySelector && el.querySelector(':scope > .syspricing-amount');
    var existingCmp = el.querySelector && el.querySelector(':scope > .syspricing-compare');
    if (
      existing &&
      existingCmp &&
      amountsEqual(parseMoneyText(existing.textContent), b2bMajor) &&
      amountsEqual(parseMoneyText(existingCmp.textContent), catalogMajor)
    ) {
      return;
    }
    el.setAttribute('data-syspricing-cart-painted', '1');
    el.setAttribute('data-syspricing-catalog', catalogText);
    el.classList.add('syspricing-cart-price');
    el.innerHTML =
      '<span class="syspricing-compare">' +
      catalogText +
      '</span> <span class="syspricing-amount">' +
      b2bText +
      '</span>';
  }

  function paintCartTotalElement(el, catalogMajor, b2bMajor, currency) {
    if (!el) return;
    var catalogText = formatMoney(catalogMajor, currency);
    var b2bText = formatMoney(b2bMajor, currency);
    if (catalogText === b2bText) return;
    var existing = el.querySelector && el.querySelector('.syspricing-amount');
    var existingCmp = el.querySelector && el.querySelector('.syspricing-compare');
    if (
      existing &&
      existingCmp &&
      amountsEqual(parseMoneyText(existing.textContent), b2bMajor) &&
      amountsEqual(parseMoneyText(existingCmp.textContent), catalogMajor)
    ) {
      return;
    }
    el.setAttribute('data-syspricing-cart-painted', '1');
    el.innerHTML =
      'Total: <span class="syspricing-cart-price"><span class="syspricing-compare">' +
      catalogText +
      '</span> <span class="syspricing-amount">' +
      b2bText +
      '</span></span>';
  }

  function hideOtherMoneyLeaves(row, keepEl) {
    if (!row || !keepEl) return;
    var nodes = moneyLeafNodes(row, true);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i].el;
      if (el === keepEl || (keepEl.contains && keepEl.contains(el))) continue;
      if (el.closest && el.closest('#CartTotal, .cart__footer, #AjaxCartSubtotal')) continue;
      if (el.getAttribute('data-syspricing-dup-hidden') === '1') continue;
      el.setAttribute('data-syspricing-dup-hidden', '1');
      el.setAttribute('data-syspricing-dup-display', el.style.display || '');
      el.style.display = 'none';
    }
  }

  function pickRowPriceTarget(row, catalogUnit, qty, b2bUnit) {
    var lineCat = catalogUnit * qty;
    var lineB2b = b2bUnit * qty;
    var preferred = row.querySelector('.product-price, .ajax-cart__price, .cart-item__price, .cart__price, .price, [data-cart-item-price]');
    var scope = preferred || row;
    var nodes = moneyLeafNodes(scope);
    if (!nodes.length && scope !== row) nodes = moneyLeafNodes(row);
    function match(amount) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        if (amountsEqual(nodes[i].amount, amount)) return nodes[i];
      }
      return null;
    }
    var hit = match(lineCat) || match(catalogUnit) || match(lineB2b) || match(b2bUnit);
    if (hit) {
      var useUnit = amountsEqual(hit.amount, catalogUnit) || amountsEqual(hit.amount, b2bUnit);
      return {
        el: hit.el,
        catalog: useUnit ? catalogUnit : lineCat,
        b2b: useUnit ? b2bUnit : lineB2b,
      };
    }
    if (nodes.length) {
      return { el: nodes[nodes.length - 1].el, catalog: lineCat, b2b: lineB2b };
    }
    return null;
  }

  function rowHasCorrectPrice(row, catalogMajor, b2bMajor) {
    var wrap = row.querySelector('.syspricing-cart-price');
    if (!wrap) return false;
    var cmp = wrap.querySelector('.syspricing-compare');
    var amt = wrap.querySelector('.syspricing-amount');
    return (
      cmp &&
      amt &&
      amountsEqual(parseMoneyText(cmp.textContent), catalogMajor) &&
      amountsEqual(parseMoneyText(amt.textContent), b2bMajor)
    );
  }

  function flattenPaintedRow(row) {
    if (!row) return;
    var hosts = row.querySelectorAll('.syspricing-cart-price');
    for (var i = hosts.length - 1; i >= 0; i--) {
      var host = hosts[i];
      var catalog = host.getAttribute('data-syspricing-catalog') || '';
      if (!catalog) {
        var html = String(host.innerHTML || '');
        var tagged = html.match(/syspricing-compare[^>]*>([^<]+)/);
        catalog = tagged ? tagged[1].trim() : '';
      }
      if (!catalog) {
        var money = String(host.textContent || '').match(/Q[\d.,]+/);
        catalog = money ? money[0] : String(host.textContent || '').trim();
      }
      host.textContent = catalog;
      host.classList.remove('syspricing-cart-price');
      host.removeAttribute('data-syspricing-cart-painted');
      host.removeAttribute('data-syspricing-catalog');
    }
    row.removeAttribute('data-syspricing-row-painted');
  }

  function paintRowPrices(row, catalogUnit, qty, b2bUnit, currency) {
    if (!row) return;
    var lineCat = catalogUnit * qty;
    var lineB2b = b2bUnit * qty;
    var wraps = row.querySelectorAll('.syspricing-cart-price');
    if (
      wraps.length === 1 &&
      (rowHasCorrectPrice(row, lineCat, lineB2b) || rowHasCorrectPrice(row, catalogUnit, b2bUnit))
    ) {
      hideOtherMoneyLeaves(row, wraps[0]);
      row.setAttribute('data-syspricing-row-painted', '1');
      return;
    }
    if (wraps.length) flattenPaintedRow(row);
    var target = pickRowPriceTarget(row, catalogUnit, qty, b2bUnit);
    if (!target) return;
    paintMoneyNode(target.el, target.catalog, target.b2b, currency);
    hideOtherMoneyLeaves(row, target.el);
    row.setAttribute('data-syspricing-row-painted', '1');
  }

  function cartItemRows() {
    var wrap = document.querySelector('#AjaxCartForm .cart__items, cart-form .cart__items, form.cart__form .cart__items, .cart__items');
    if (!wrap) return [];
    return Array.prototype.slice.call(wrap.children);
  }

  function findItemRow(item) {
    var rows = cartItemRows();
    if (!rows.length) return null;
    var vid = String(item.variant_id || '');
    var handle = item.handle || '';
    var title = String(item.product_title || item.title || '').trim();
    var key = item.key || '';
    function rowMatch(test) {
      for (var i = 0; i < rows.length; i++) {
        if (test(rows[i])) return rows[i];
      }
      return null;
    }
    var found = null;
    if (vid) {
      found = rowMatch(function (row) {
        return row.querySelector(
          '[data-variant-id="' + vid + '"], [data-id="' + vid + '"], [data-variant="' + vid + '"], [ymq-b2b-variant-id="' + vid + '"]'
        );
      });
      if (found) return found;
    }
    if (key) {
      found = rowMatch(function (row) {
        return row.querySelector('[data-line="' + key + '"], [data-key="' + key + '"]');
      });
      if (found) return found;
    }
    if (handle) {
      found = rowMatch(function (row) {
        return row.querySelector('a[href*="/products/' + handle + '"]');
      });
      if (found) return found;
    }
    if (title) {
      var matches = [];
      for (var m = 0; m < rows.length; m++) {
        if (String(rows[m].textContent || '').indexOf(title) !== -1) matches.push(rows[m]);
      }
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  function paintCart(cart, priceMap, currency) {
    if (!cart || !cart.items || !cart.items.length) return;

    var b2bSubtotal = 0;
    var catalogSubtotal = 0;
    var usedRows = [];

    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      var qty = Math.max(1, Number(item.quantity) || 1);
      var catalogUnit = Number(item.original_price != null ? item.original_price : item.price) / 100;
      var info = pickPrice(priceMap, item.variant_id);
      var b2bUnit =
        info && info.price != null
          ? Number(info.price)
          : item.final_price != null && Number(item.final_price) < Number(item.price)
            ? Number(item.final_price) / 100
            : catalogUnit;
      catalogSubtotal += catalogUnit * qty;
      b2bSubtotal += b2bUnit * qty;
      if (!Number.isFinite(b2bUnit) || b2bUnit >= catalogUnit) continue;

      var row = findItemRow(item);
      if (!row) {
        var allRows = cartItemRows();
        if (allRows.length === cart.items.length) row = allRows[i];
      }
      if (!row || usedRows.indexOf(row) !== -1) continue;
      usedRows.push(row);
      paintRowPrices(row, catalogUnit, qty, b2bUnit, currency);
    }

    if (b2bSubtotal < catalogSubtotal) {
      lastB2bCartTotal = b2bSubtotal;
      lastCatalogCartTotal = catalogSubtotal;
      paintCartTotalElement(document.getElementById('CartTotal'), catalogSubtotal, b2bSubtotal, currency);
    }
  }

  var cartPaintTimer = null;
  var cartPaintInFlight = false;
  var suppressCartObs = false;
  function scheduleCartPaint() {
    if (suppressCartObs) return;
    clearTimeout(cartPaintTimer);
    cartPaintTimer = setTimeout(paintCartFromApi, 80);
  }

  function paintCartFromApi() {
    var boot = getCartBoot();
    if (cartPaintInFlight) return Promise.resolve(false);
    var currency = (boot && boot.getAttribute('data-currency')) || 'GTQ';
    cartPaintInFlight = true;

    return fetch('/cart.js', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('cart');
        return r.json();
      })
      .then(function (cart) {
        var ids = (cart.items || [])
          .map(function (it) {
            return it.variant_id;
          })
          .filter(Boolean);
        if (!ids.length) {
          restoreCartPrices();
          return false;
        }
        return fetchProxyPrices(ids).then(function (body) {
          var prices = (body && body.data && body.data.prices) || {};
          var hasB2b = Object.keys(prices).length > 0;
          suppressCartObs = true;
          try {
            if (hasB2b) {
              paintCart(cart, prices, currency);
              setTimeout(function () {
                paintCart(cart, prices, currency);
              }, 250);
              setTimeout(function () {
                paintCart(cart, prices, currency);
              }, 900);
            } else {
              restoreCartPrices();
            }
          } finally {
            setTimeout(function () {
              suppressCartObs = false;
            }, 400);
          }
          return hasB2b || session.loggedIn;
        });
      })
      .catch(function () {
        return false;
      })
      .then(function (ok) {
        cartPaintInFlight = false;
        return ok;
      });
  }

  function isCartMutationUrl(url) {
    return /\/cart\/(add|change|update|clear)/.test(String(url || ''));
  }

  function watchCartNetwork() {
    if (window.fetch && !window.fetch._syspricing) {
      var origFetch = window.fetch;
      window.fetch = function () {
        return origFetch.apply(this, arguments).then(function (res) {
          try {
            var req = arguments[0];
            var url = String((req && req.url) || req || '');
            if (isCartMutationUrl(url)) scheduleCartPaint();
          } catch (_) {}
          return res;
        });
      };
      window.fetch._syspricing = true;
    }
    if (window.XMLHttpRequest && !window.XMLHttpRequest._syspricing) {
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        this._syspricingUrl = String(url || '');
        return origOpen.apply(this, arguments);
      };
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
          if (isCartMutationUrl(this._syspricingUrl)) scheduleCartPaint();
        });
        return origSend.apply(this, arguments);
      };
      window.XMLHttpRequest._syspricing = true;
    }
    document.addEventListener('cart:updated', scheduleCartPaint);
    document.addEventListener('cart:refresh', scheduleCartPaint);
    document.addEventListener('theme:cart:change', scheduleCartPaint);
    document.addEventListener('cart-updated', scheduleCartPaint, true);
  }

  var checkoutInFlight = false;

  function checkoutDiscountUrl(pricesProxy) {
    return String(pricesProxy || '/apps/syspricing/prices').replace(/\/prices\/?$/, '/checkout-discount');
  }

  function goToCheckout(codes) {
    var list = Array.isArray(codes) ? codes.filter(Boolean) : codes ? [codes] : [];
    if (!list.length) {
      window.location.href = '/checkout';
      return;
    }
    if (list.length === 1) {
      window.location.href =
        '/discount/' + encodeURIComponent(list[0]) + '?redirect=' + encodeURIComponent('/checkout');
      return;
    }
    fetch('/cart/update.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ discount: list.join(',') }),
    })
      .catch(function () {})
      .then(function () {
        window.location.href = '/checkout';
      });
  }

  function requestCheckoutCode(cart, boot) {
    var proxy = checkoutDiscountUrl(
      (boot && boot.getAttribute('data-proxy')) || '/apps/syspricing/prices'
    );
    var lines = (cart.items || [])
      .map(function (it) {
        return String(it.variant_id) + ':' + String(it.quantity || 1);
      })
      .join(',');
    var params = new URLSearchParams();
    params.set('lines', lines);
    var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    return fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        var data = (body && body.data) || {};
        if (data.ok && Array.isArray(data.codes) && data.codes.length) return data.codes;
        if (data.ok && data.code) return [data.code];
        return [];
      });
  }

  function proceedToB2bCheckout(e) {
    var boot = getCartBoot();
    if (!boot) return false;
    if (checkoutInFlight) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    checkoutInFlight = true;
    e.preventDefault();
    e.stopPropagation();
    var done = false;
    function finish(codes) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      goToCheckout(codes);
    }
    var timeout = setTimeout(function () {
      finish([]);
    }, 12000);
    fetch('/cart.js', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        if (!cart || !cart.items || !cart.items.length) {
          finish([]);
          return;
        }
        return requestCheckoutCode(cart, boot).then(function (codes) {
          finish(codes);
        });
      })
      .catch(function () {
        finish([]);
      });
    return true;
  }

  function isCheckoutClickTarget(el) {
    if (!el || !el.closest) return false;
    if (el.closest('a[href*="/checkout"], [formaction*="/checkout"]')) return true;
    if (el.closest('button[name="checkout"], input[name="checkout"]')) return true;
    var btn = el.closest('button, input[type="submit"], a');
    if (!btn) return false;
    var label = String(btn.textContent || btn.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (
      /^(check\s*out|pagar|finalizar compra|ir a caja|proceder al pago)$/.test(label) ||
      /finalizar compra|ir a checkout|proceed to checkout/.test(label)
    ) {
      if (btn.closest('form[action*="/cart"], cart-drawer, .cart-drawer, #CartDrawer, .ajax-cart, [id*="cart"], [class*="cart"]')) {
        return true;
      }
    }
    return false;
  }

  function watchCheckout() {
    if (window.__SYSPRICING_CHECKOUT_WATCH) return;
    window.__SYSPRICING_CHECKOUT_WATCH = true;
    document.addEventListener(
      'click',
      function (e) {
        if (e.button && e.button !== 0) return;
        if (!isCheckoutClickTarget(e.target)) return;
        proceedToB2bCheckout(e);
      },
      true
    );
    document.addEventListener(
      'submit',
      function (e) {
        var submitter = e.submitter;
        var checkoutSubmit =
          submitter &&
          (submitter.name === 'checkout' ||
            /checkout/i.test(submitter.getAttribute('formaction') || '') ||
            /checkout/i.test(submitter.getAttribute('href') || ''));
        if (!checkoutSubmit) return;
        proceedToB2bCheckout(e);
      },
      true
    );
  }

  function syncPrices() {
    var nodes = document.querySelectorAll('#syspricing-b2b-price, .syspricing-b2b-price');
    for (var i = 0; i < nodes.length; i++) boot(nodes[i]);
    var tasks = [fetchGridPrices(), paintCartFromApi()];
    return Promise.all(tasks);
  }

  var resyncTimer = null;
  function scheduleResync(delay) {
    clearTimeout(resyncTimer);
    resyncTimer = setTimeout(function () {
      syncPrices();
    }, delay || 0);
  }

  function watchSession() {
    if (window.__SYSPRICING_SESSION_WATCH) return;
    window.__SYSPRICING_SESSION_WATCH = true;
    window.addEventListener('pageshow', function (ev) {
      scheduleResync(ev.persisted ? 0 : 50);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleResync(50);
    });
    window.addEventListener('focus', function () {
      scheduleResync(150);
    });
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var href = String(a.getAttribute('href') || '');
        if (/\/account\/(login|logout)|customer_authentication|\/challenge/i.test(href)) {
          setTimeout(function () {
            scheduleResync(400);
          }, 0);
        }
      },
      true
    );
  }

  function init() {
    watchCartNetwork();
    watchCheckout();
    watchSession();
    syncPrices();
    setTimeout(syncPrices, 400);
    setTimeout(syncPrices, 1500);
    setTimeout(syncPrices, 3500);
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
    new MutationObserver(function (mutations) {
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (target && target.closest && target.closest('.syspricing-card-price, .syspricing-b2b-price')) {
          continue;
        }
        relevant = true;
        break;
      }
      if (!relevant) return;
      clearTimeout(t);
      t = setTimeout(fetchGridPrices, 120);
    }).observe(grid, { childList: true, subtree: true });
  }
  if (window.MutationObserver && !window.__SYSPRICING_CART_OBS) {
    window.__SYSPRICING_CART_OBS = true;
    var cartObsT = null;
    new MutationObserver(function (mutations) {
      if (suppressCartObs) return;
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var t = m.target;
        if (t && t.closest && t.closest('.syspricing-card-price, .syspricing-b2b-price')) {
          continue;
        }
        if (
          t &&
          t.closest &&
          t.closest('.syspricing-cart-price') &&
          lastB2bCartTotal != null &&
          amountsEqual(parseMoneyText((document.getElementById('CartTotal') || {}).textContent || ''), lastB2bCartTotal)
        ) {
          continue;
        }
        relevant = true;
        break;
      }
      if (!relevant) return;
      clearTimeout(cartObsT);
      cartObsT = setTimeout(paintCartFromApi, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
