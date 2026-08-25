/**
 * SYSPRICING storefront — catalog (line-through) + B2B side by side.
 * PDP: .syspricing-b2b-price | Collection: .syspricing-grid-item (+ proxy batch)
 * Cart drawer / cart page: rewrite catalog amounts to B2B.
 */
(function () {
  if (window.__SYSPRICING_PRICE_BOOTED) return;
  window.__SYSPRICING_PRICE_BOOTED = true;
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
      ' <span class="syspricing-tag">Precio Especial</span>' +
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

  function getCartBoot() {
    return (
      document.getElementById('syspricing-cart-boot') ||
      document.getElementById('syspricing-collection-boot') ||
      document.querySelector('#syspricing-b2b-price[data-logged-in="1"], .syspricing-b2b-price[data-logged-in="1"]')
    );
  }

  function moneyTextVariants(major, currency) {
    var n = Number(major);
    if (!Number.isFinite(n)) return [];
    var formatted = formatMoney(n, currency);
    var two = n.toFixed(2);
    var whole = String(Math.round(n));
    var twoComma = two.replace('.', ',');
    var out = [formatted, 'Q' + two, 'Q' + whole, 'Q' + twoComma, two, whole];
    if (String(currency || '').toUpperCase() === 'GTQ') {
      out.push('Q ' + two, 'Q ' + whole);
    }
    return out.filter(function (t, i, arr) {
      return t && arr.indexOf(t) === i;
    });
  }

  function leafMoneyNodes(root, major, currency) {
    if (!root) return [];
    var texts = moneyTextVariants(major, currency);
    var set = {};
    for (var i = 0; i < texts.length; i++) set[texts[i]] = true;
    var nodes = root.querySelectorAll('span, div, p, b, strong, td, em, small, a');
    var hits = [];
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (el.closest && el.closest('.syspricing-card-price, .syspricing-b2b-price, .syspricing-cart-price')) {
        continue;
      }
      if (el.children && el.children.length) continue;
      var t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (set[t]) hits.push(el);
    }
    return hits;
  }

  function paintMoneyNode(el, catalogMajor, b2bMajor, currency) {
    if (!el || el.getAttribute('data-syspricing-cart-painted') === '1') return;
    if (el.closest && el.closest('.syspricing-cart-price, .syspricing-card-price, .syspricing-b2b-price')) {
      return;
    }
    var catalogText = formatMoney(catalogMajor, currency);
    var b2bText = formatMoney(b2bMajor, currency);
    if (catalogText === b2bText) return;
    el.setAttribute('data-syspricing-cart-painted', '1');
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
    if (el.getAttribute('data-syspricing-cart-painted') === '1') return;
    if (el.querySelector && el.querySelector('.syspricing-cart-price')) {
      el.setAttribute('data-syspricing-cart-painted', '1');
      return;
    }
    var catalogText = formatMoney(catalogMajor, currency);
    var b2bText = formatMoney(b2bMajor, currency);
    if (catalogText === b2bText) return;
    el.setAttribute('data-syspricing-cart-painted', '1');
    el.innerHTML =
      'Total: <span class="syspricing-cart-price"><span class="syspricing-compare">' +
      catalogText +
      '</span> <span class="syspricing-amount">' +
      b2bText +
      '</span></span>';
  }

  function findItemRoots(cartRoot, item) {
    var roots = [];
    var vid = String(item.variant_id || '');
    var handle = item.handle || '';
    var title = String(item.product_title || item.title || '').trim();
    var sels = [];
    if (vid) {
      sels.push('[data-variant-id="' + vid + '"]');
      sels.push('[data-id="' + vid + '"]');
      sels.push('[data-variant="' + vid + '"]');
    }
    if (item.key) {
      sels.push('[data-line="' + item.key + '"]');
      sels.push('[data-key="' + item.key + '"]');
    }
    for (var i = 0; i < sels.length; i++) {
      var found = cartRoot.querySelectorAll(sels[i]);
      for (var j = 0; j < found.length; j++) roots.push(found[j]);
    }
    if (!roots.length && handle) {
      var links = cartRoot.querySelectorAll('a[href*="/products/' + handle + '"]');
      for (var k = 0; k < links.length; k++) {
        var row = links[k].closest('tr, li, .cart-item, .ajax-cart__product, [class*="cart-item"], [class*="cart__item"]');
        if (row) roots.push(row);
      }
    }
    if (!roots.length && title) {
      var candidates = cartRoot.querySelectorAll('tr, li, article, [class*="cart-item"], [class*="cart__item"], [class*="ajax-cart"]');
      for (var m = 0; m < candidates.length; m++) {
        var txt = String(candidates[m].textContent || '');
        if (txt.indexOf(title) !== -1) roots.push(candidates[m]);
      }
    }
    return roots;
  }

  function findCartRoots() {
    var sels = [
      '[data-js-site-cart-sidebar]',
      '#AjaxCartSubtotal',
      '#AjaxCartForm',
      '#CartTotal',
      'cart-form',
      'cart-drawer',
      '#CartDrawer',
      '#cart-drawer',
      '.cart-drawer',
      '[data-cart-drawer]',
      '.ajax-cart',
      '.mini-cart',
      '.sidebar-cart',
      '#sidebar-cart',
      '.drawer--cart',
      'form[action="/cart"]',
      'form[action$="/cart"]',
      '.cart-items',
      '#CartItems',
      '.cart__items',
      '.cart-overlay',
      '#Cart',
      '.js-cart',
    ];
    var roots = [];
    var seen = [];
    function add(el) {
      if (!el || seen.indexOf(el) !== -1) return;
      seen.push(el);
      roots.push(el);
    }
    for (var i = 0; i < sels.length; i++) {
      var list = document.querySelectorAll(sels[i]);
      for (var j = 0; j < list.length; j++) add(list[j]);
    }
    var labeled = document.querySelectorAll('aside, drawer, [class*="drawer"], [class*="sidebar"], [id*="cart"], [class*="cart"]');
    for (var k = 0; k < labeled.length; k++) {
      var t = String(labeled[k].textContent || '');
      if (/producto en tu carrito|item[s]?\s+in\s+(your\s+)?cart/i.test(t)) add(labeled[k]);
    }
    return roots;
  }

  function paintCart(cart, priceMap, currency) {
    if (!cart || !cart.items || !cart.items.length) return;
    var roots = findCartRoots();
    if (!roots.length) roots = [document.body];

    var b2bSubtotal = 0;
    var catalogSubtotal = 0;

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

      for (var r = 0; r < roots.length; r++) {
        var itemRoots = findItemRoots(roots[r], item);
        if (!itemRoots.length) {
          var rid = roots[r].id || '';
          if (rid === 'AjaxCartSubtotal' || rid === 'CartTotal') continue;
          itemRoots = [roots[r]];
        }
        for (var ir = 0; ir < itemRoots.length; ir++) {
          var unitNodes = leafMoneyNodes(itemRoots[ir], catalogUnit, currency);
          for (var u = 0; u < unitNodes.length; u++) {
            paintMoneyNode(unitNodes[u], catalogUnit, b2bUnit, currency);
          }
          var lineCatalog = catalogUnit * qty;
          var lineB2b = b2bUnit * qty;
          if (qty > 1 || lineCatalog !== catalogUnit) {
            var lineNodes = leafMoneyNodes(itemRoots[ir], lineCatalog, currency);
            for (var ln = 0; ln < lineNodes.length; ln++) {
              paintMoneyNode(lineNodes[ln], lineCatalog, lineB2b, currency);
            }
          }
        }
      }
    }

    if (b2bSubtotal < catalogSubtotal) {
      var cartTotalEl = document.getElementById('CartTotal');
      if (cartTotalEl) {
        paintCartTotalElement(cartTotalEl, catalogSubtotal, b2bSubtotal, currency);
      } else {
        var subtotalRoot = document.getElementById('AjaxCartSubtotal');
        var totalRoots = subtotalRoot ? [subtotalRoot] : roots;
        for (var t = 0; t < totalRoots.length; t++) {
          var totalNodes = leafMoneyNodes(totalRoots[t], catalogSubtotal, currency);
          for (var tn = 0; tn < totalNodes.length; tn++) {
            paintMoneyNode(totalNodes[tn], catalogSubtotal, b2bSubtotal, currency);
          }
        }
      }
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
    if (!boot || boot.getAttribute('data-logged-in') !== '1') return;
    if (cartPaintInFlight) return;
    var tags = boot.getAttribute('data-customer-tags') || '';
    var proxy = boot.getAttribute('data-proxy') || '/apps/syspricing/prices';
    var currency = boot.getAttribute('data-currency') || 'GTQ';
    cartPaintInFlight = true;

    fetch('/cart.js', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('cart');
        return r.json();
      })
      .then(function (cart) {
        var ids = (cart.items || []).map(function (it) {
          return it.variant_id;
        }).filter(Boolean);
        if (!ids.length) return null;
        var params = new URLSearchParams();
        params.set('variant_ids', ids.join(','));
        if (tags) params.set('tags', tags);
        var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();
        return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
          .then(function (r) {
            if (!r.ok) throw new Error('proxy');
            return r.json();
          })
          .then(function (body) {
            suppressCartObs = true;
            try {
              paintCart(cart, (body && body.data && body.data.prices) || {}, currency);
            } finally {
              setTimeout(function () {
                suppressCartObs = false;
              }, 400);
            }
          });
      })
      .catch(function () {})
      .then(function () {
        cartPaintInFlight = false;
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
    var tags = boot.getAttribute('data-customer-tags') || '';
    var proxy = checkoutDiscountUrl(boot.getAttribute('data-proxy') || '/apps/syspricing/prices');
    var lines = (cart.items || [])
      .map(function (it) {
        return String(it.variant_id) + ':' + String(it.quantity || 1);
      })
      .join(',');
    var params = new URLSearchParams();
    params.set('lines', lines);
    if (tags) params.set('tags', tags);
    var url = proxy + (proxy.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
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
    if (!boot || boot.getAttribute('data-logged-in') !== '1') return false;
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
    fetch('/cart.js', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
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

  function init() {
    var nodes = document.querySelectorAll('#syspricing-b2b-price, .syspricing-b2b-price');
    for (var i = 0; i < nodes.length; i++) boot(nodes[i]);
    fetchGridPrices();
    watchCartNetwork();
    watchCheckout();
    paintCartFromApi();
    setTimeout(paintCartFromApi, 400);
    setTimeout(paintCartFromApi, 1200);
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
  if (window.MutationObserver && !window.__SYSPRICING_CART_OBS) {
    window.__SYSPRICING_CART_OBS = true;
    var cartObsT = null;
    new MutationObserver(function (mutations) {
      if (suppressCartObs) return;
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var t = m.target;
        if (t && t.closest && t.closest('.syspricing-cart-price, .syspricing-card-price, .syspricing-b2b-price, #CartTotal')) {
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
