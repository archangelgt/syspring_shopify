'use strict';

/**
 * Admin embebido — Price Lists por tag de cliente.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAppPage({ apiKey, shop, host, tab, appTitle, appSubtitle }) {
  const title = appTitle || 'SysPricing';
  const subtitle = appSubtitle || 'B2B Price Engine';
  const active = tab || 'inicio';

  const qs = (t) => {
    const p = new URLSearchParams();
    if (shop) p.set('shop', shop);
    if (host) p.set('host', host);
    p.set('embedded', '1');
    if (t) p.set('tab', t);
    return `/?${p.toString()}`;
  };

  const tabs = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'price-lists', label: 'Price Lists' },
    { id: 'variant-pricing', label: 'Variant Pricing' },
    { id: 'import', label: 'CSV Import' },
    { id: 'customers', label: 'Clientes' },
    { id: 'activity', label: 'Activity' },
  ];

  let panel = '';
  if (active === 'inicio') {
    panel = `
      <div class="home-hero">
        <div>
          <p class="eyebrow">Precios B2B</p>
          <h2>Bienvenido a SYSPRICING</h2>
          <p class="lead">
            Define precios especiales según el <strong>tag</strong> del cliente en Shopify.
            El cliente inicia sesión y ve su precio en la tienda.
          </p>
        </div>
        <div class="home-ready" id="home-ready">
          <div class="ready-ring" id="ready-ring">—</div>
          <div>
            <strong>Tu configuración</strong>
            <p class="muted" id="ready-label" style="margin:0.25rem 0 0;">Cargando…</p>
          </div>
        </div>
      </div>

      <div id="flash"></div>

      <div class="stat-grid" id="home-stats">
        <div class="stat-card"><span class="stat-label">Listas de precios</span><span class="stat-value" data-stat="priceLists">—</span></div>
        <div class="stat-card"><span class="stat-label">Activas</span><span class="stat-value" data-stat="activePriceLists">—</span></div>
        <div class="stat-card"><span class="stat-label">Precios cargados</span><span class="stat-value" data-stat="variantPrices">—</span></div>
        <div class="stat-card"><span class="stat-label">Borradores</span><span class="stat-value" data-stat="draftPriceLists">—</span></div>
      </div>

      <div class="home-grid">
        <section class="home-section">
          <h3><i class="fas fa-list-check"></i> Pasos para empezar</h3>
          <ul class="checklist" id="home-checklist">
            <li data-check="lists"><span class="check-dot"></span><div><strong>Crea tus listas de precios</strong><p class="muted">Cada lista usa el mismo nombre que el tag del cliente (ej. <code>mayorista</code>).</p><a class="link-btn" href="${qs('price-lists')}">Ir a Price Lists →</a></div></li>
            <li data-check="prices"><span class="check-dot"></span><div><strong>Asigna precios a productos</strong><p class="muted">Define el precio fijo de cada variante por lista.</p><a class="link-btn" href="${qs('variant-pricing')}">Ir a Variant Pricing →</a></div></li>
            <li data-check="tags"><span class="check-dot pending"></span><div><strong>Etiqueta a tus clientes</strong><p class="muted">En Shopify Admin → Customers, agrega el tag de la lista.</p><a class="link-btn" href="${qs('customers')}">Ver clientes →</a></div></li>
            <li data-check="theme"><span class="check-dot pending"></span><div><strong>Muestra el precio en la tienda</strong><p class="muted">Activa el bloque de precio B2B en la página de producto del tema.</p></div></li>
          </ul>
          <div class="home-actions">
            <button type="button" id="btn-setup-storefront" class="btn-secondary">Preparar tienda</button>
            <a class="btn-ghost" href="${qs('import')}">Importar CSV</a>
          </div>
        </section>

        <section class="home-section">
          <h3><i class="fas fa-tags"></i> Tus listas activas</h3>
          <p class="muted" style="margin-top:0">Estas son las listas listas para usarse con clientes etiquetados.</p>
          <div id="top-tags" class="tag-cloud"></div>
          <p class="muted tiny" id="top-tags-empty" style="display:none;margin-top:0.75rem">Aún no hay listas activas. Crea la primera en Price Lists.</p>
        </section>
      </div>

      <section class="home-section" style="margin-top:0.85rem">
        <h3><i class="fas fa-route"></i> Cómo funciona</h3>
        <div class="flow-grid">
          <div class="flow-step"><span class="flow-n">1</span><strong>Etiqueta al cliente</strong><p class="muted">Asigna el tag en Shopify.</p></div>
          <div class="flow-step"><span class="flow-n">2</span><strong>Lista de precios</strong><p class="muted">La lista con ese tag se activa.</p></div>
          <div class="flow-step"><span class="flow-n">3</span><strong>Precios por producto</strong><p class="muted">Cada variante tiene su precio.</p></div>
          <div class="flow-step"><span class="flow-n">4</span><strong>Tienda</strong><p class="muted">El cliente logueado ve su precio.</p></div>
        </div>
        <p class="muted tiny" style="margin-top:0.85rem">
          Si un cliente tiene varios tags, se usa la lista activa con mayor prioridad que tenga precio para ese producto.
        </p>
      </section>

      <section class="home-section" style="margin-top:0.85rem">
        <div class="section-head">
          <h3><i class="fas fa-clock-rotate-left"></i> Actividad reciente</h3>
          <a class="link-btn" href="${qs('activity')}">Ver todo →</a>
        </div>
        <div id="home-activity"><p class="muted">Cargando…</p></div>
      </section>
    `;
  } else if (active === 'price-lists') {
    panel = `
      <h2>Price Lists</h2>
      <p class="muted">Crea una lista por cada tag de cliente. El tag debe coincidir con el del cliente en Shopify.</p>
      <div id="flash"></div>
      <form id="pl-form" class="form-row">
        <input name="tag" class="input-grow" placeholder="TAG (ej. DPAÑUELOS)" required />
        <input name="name" class="input-grow" placeholder="Nombre (opcional)" />
        <input name="currency" class="input-sm" value="GTQ" />
        <input name="priority" class="input-sm" type="number" value="0" title="Priority" />
        <select name="status">
          <option value="draft">draft</option>
          <option value="active" selected>active</option>
        </select>
        <button type="submit">Crear</button>
      </form>
      <div id="pl-list" class="table-wrap"><p class="muted">Cargando…</p></div>
    `;
  } else if (active === 'variant-pricing') {
    panel = `
      <h2>Variant Pricing</h2>
      <p class="muted">Asigna el precio fijo de cada producto por lista. El % muestra el descuento frente al precio de catálogo.</p>
      <div id="flash"></div>
      <form id="prod-search" class="form-row">
        <input name="q" class="input-grow" placeholder="Search product by name, SKU" />
        <button type="submit">Buscar</button>
        <button type="button" id="btn-save-matrix" class="btn-secondary">Guardar cambios</button>
      </form>
      <div id="matrix-wrap" class="table-wrap matrix"><p class="muted">Busca productos para editar precios.</p></div>
      <p class="scroll-hint">Desliza horizontalmente para ver todas las listas.</p>
    `;
  } else if (active === 'import') {
    panel = `
      <h2>Importar / Exportar precios</h2>
      <p class="muted">
        Formato matriz (como WPD): <code>product_id, variant_id, variant_name, sku, original_price, TAG1, TAG2…</code>
        — también acepta el CSV largo <code>sku,variant_id,tag,price</code>.
      </p>
      <div id="flash"></div>
      <div class="export-collections">
        <h3 class="section-title">Exportar</h3>
        <div class="form-row export-toolbar" style="margin:0 0 0.5rem">
          <input type="search" id="collection-filter" class="input-grow" placeholder="Filtrar colecciones…" />
          <button type="button" id="btn-expand-collections" class="btn-ghost">Expandir</button>
          <button type="button" id="btn-collapse-collections" class="btn-ghost">Colapsar</button>
          <button type="button" id="btn-refresh-collections" class="btn-ghost">Actualizar</button>
          <button type="button" id="btn-export-csv" class="btn-secondary">Exportar Excel</button>
        </div>
        <div id="collection-tree" class="collection-tree" aria-label="Colecciones">
          <p class="muted">Cargando colecciones…</p>
        </div>
        <p class="muted" id="collection-selection-hint" style="margin:0.45rem 0 0.75rem">
          Sin selección = todo el catálogo. Marca una o varias colecciones para exportar solo esas.
        </p>
      </div>
      <div class="import-panel">
        <h3 class="section-title">Importar</h3>
        <div id="import-dropzone" class="import-dropzone" tabindex="0">
          <input type="file" id="import-file" accept=".xlsx,.xls,.csv,text/csv" hidden />
          <div class="import-dropzone-inner">
            <i class="fa-solid fa-file-arrow-up"></i>
            <p><strong class="drop-desktop">Arrastra un Excel/CSV</strong><strong class="drop-mobile">Toca para subir Excel/CSV</strong> o <button type="button" id="btn-pick-import" class="linkish">elige un archivo</button></p>
            <p class="muted">.xlsx · .xls · .csv</p>
          </div>
        </div>
        <div id="import-file-meta" class="import-file-meta" style="display:none"></div>
        <div id="import-preview-wrap" class="table-wrap import-preview-wrap" style="display:none">
          <table id="import-preview" class="import-preview-table"><thead></thead><tbody></tbody></table>
        </div>
        <p class="scroll-hint" id="import-scroll-hint" hidden>Desliza horizontalmente para ver más columnas.</p>
        <p id="import-preview-note" class="muted" style="display:none;margin:0.4rem 0 0"></p>
        <div id="import-status" class="alert" style="display:none;margin:0.65rem 0 0"></div>
        <div class="form-row" id="import-actions" style="display:none;margin-top:0.75rem">
          <button type="button" id="btn-clear-import" class="btn-ghost">Quitar archivo</button>
          <button type="button" id="btn-run-import" class="btn-secondary" onclick="window.__syspricingRunImport&&window.__syspricingRunImport();return false;">Importar</button>
        </div>
        <pre id="csv-result" class="card" style="display:none;white-space:pre-wrap"></pre>
      </div>
    `;
  } else if (active === 'customers') {
    panel = `
      <h2>Clientes</h2>
      <p class="muted">Consulta qué listas coinciden con los tags de cada cliente. Los tags se gestionan en Shopify Admin.</p>
      <div id="flash"></div>
      <form id="cust-search" class="form-row">
        <input name="q" class="input-grow" placeholder="email, nombre…" />
        <button type="submit">Buscar</button>
      </form>
      <div id="cust-list" class="table-wrap"><p class="muted">Busca para listar clientes.</p></div>
    `;
  } else if (active === 'activity') {
    panel = `
      <h2>Actividad</h2>
      <p class="muted">Historial de cambios en listas y precios.</p>
      <div id="act-list" class="table-wrap"><p class="muted">Cargando…</p></div>
    `;
  } else {
    panel = `<h2>Tab desconocida</h2><p class="muted">${escapeHtml(active)}</p>`;
  }

  const tabNav = tabs
    .map(
      (t) =>
        `<a class="tab ${active === t.id ? 'active' : ''}" href="${qs(t.id)}">${escapeHtml(t.label)}</a>`
    )
    .join('');

  const clientScript = `
<script>
(function () {
  var SHOP = ${JSON.stringify(shop || '')};
  var TAB = ${JSON.stringify(active)};
  function api(path, opts) {
    var url = '/api/v1' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'shop=' + encodeURIComponent(SHOP);
    return fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    }, opts || {})).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error((body.error && body.error.message) || r.statusText);
        return body;
      });
    });
  }
  function flash(msg, kind) {
    var el = document.getElementById('flash');
    if (!el) return;
    el.innerHTML = '<div class="alert ' + (kind || 'ok') + '">' + msg + '</div>';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function pct(base, price) {
    var b = Number(base), p = Number(price);
    if (!b || !isFinite(b) || !isFinite(p)) return '—';
    return (((b - p) / b) * 100).toFixed(2) + '%';
  }

  if (TAB === 'inicio') {
    function markCheck(key, ok) {
      var li = document.querySelector('[data-check="' + key + '"] .check-dot');
      if (!li) return;
      li.classList.toggle('ok', !!ok);
      li.classList.toggle('pending', !ok);
    }
    function renderHome(data) {
      var s = data.stats || {};
      document.querySelectorAll('[data-stat]').forEach(function (el) {
        var k = el.getAttribute('data-stat');
        el.textContent = s[k] != null ? s[k] : '—';
      });
      var score = data.readyScore || 0;
      var total = data.readyTotal || 2;
      var ring = document.getElementById('ready-ring');
      var label = document.getElementById('ready-label');
      ring.textContent = score + '/' + total;
      ring.className = 'ready-ring ' + (score >= total ? 'ready' : score > 0 ? 'partial' : '');
      label.textContent = score >= total
        ? 'Listo: tus listas y precios están configurados'
        : score > 0
          ? 'Casi listo: carga precios en Variant Pricing'
          : 'Empieza creando una lista de precios';
      markCheck('lists', data.checklist && data.checklist.hasPriceLists);
      markCheck('prices', data.checklist && data.checklist.hasPrices);
      var tags = data.topTags || [];
      var cloud = document.getElementById('top-tags');
      var empty = document.getElementById('top-tags-empty');
      if (tags.length) {
        if (empty) empty.style.display = 'none';
        cloud.innerHTML = tags.map(function (t) {
          return '<span class="tag-pill"><code>' + esc(t.tag) + '</code><span>prioridad ' + esc(t.priority) + '</span></span>';
        }).join('');
      } else {
        cloud.innerHTML = '';
        if (empty) empty.style.display = 'block';
      }
      var rows = data.recentActivity || [];
      var act = document.getElementById('home-activity');
      if (!rows.length) {
        act.innerHTML = '<p class="muted">Aún no hay actividad. Los cambios de listas y precios aparecerán aquí.</p>';
      } else {
        var html = '<table class="activity-mini"><thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>';
        rows.slice(0, 6).forEach(function (a) {
          html += '<tr><td>' + esc(a.createdAt) + '</td><td><code>' + esc(a.action) + '</code></td><td>' +
            esc(a.entityType) + ' ' + esc(a.entityId || '') + '</td></tr>';
        });
        html += '</tbody></table>';
        act.innerHTML = html;
      }
    }
    api('/dashboard').then(function (res) {
      renderHome(res.data || {});
    }).catch(function (e) {
      flash(e.message, 'err');
      document.getElementById('ready-label').textContent = 'No se pudo cargar el resumen';
      document.getElementById('home-activity').innerHTML = '<div class="alert err">' + esc(e.message) + '</div>';
    });
    var setupBtn = document.getElementById('btn-setup-storefront');
    if (setupBtn) {
      setupBtn.onclick = function () {
        setupBtn.disabled = true;
        api('/storefront/setup', { method: 'POST', body: '{}' })
          .then(function (res) {
            var msg = (res && res.data && res.data.message) || 'Tienda preparada';
            var warn = res && res.data && res.data.discount && res.data.discount.ok === false;
            flash(msg, warn ? 'warn' : 'ok');
            markCheck('theme', true);
          })
          .catch(function (e) { flash(e.message, 'err'); })
          .then(function () { setupBtn.disabled = false; });
      };
    }
  }

  if (TAB === 'price-lists') {
    function load() {
      api('/price-lists').then(function (res) {
        var rows = res.data || [];
        var html = '<table><thead><tr><th>Tag</th><th>Name</th><th>Status</th><th>Priority</th><th>Currency</th><th></th></tr></thead><tbody>';
        rows.forEach(function (pl) {
          html += '<tr><td><code>' + esc(pl.tag) + '</code></td><td>' + esc(pl.name) +
            '</td><td><code>' + esc(pl.status) + '</code></td><td>' + esc(pl.priority) +
            '</td><td>' + esc(pl.currency) +
            '</td><td><button data-del="' + esc(pl.id) + '" class="btn-danger btn-sm">Eliminar</button></td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('pl-list').innerHTML = rows.length ? html : '<p class="muted">Aún no hay listas. Crea una con el tag del cliente.</p>';
        document.querySelectorAll('[data-del]').forEach(function (btn) {
          btn.onclick = function () {
            if (!confirm('¿Eliminar price list?')) return;
            api('/price-lists/' + btn.getAttribute('data-del'), { method: 'DELETE' })
              .then(function () { flash('Eliminado', 'ok'); load(); })
              .catch(function (e) { flash(e.message, 'err'); });
          };
        });
      }).catch(function (e) { flash(e.message, 'err'); });
    }
    document.getElementById('pl-form').onsubmit = function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      api('/price-lists', {
        method: 'POST',
        body: JSON.stringify({
          tag: fd.get('tag'),
          name: fd.get('name') || fd.get('tag'),
          currency: fd.get('currency') || 'GTQ',
          priority: Number(fd.get('priority') || 0),
          status: fd.get('status')
        })
      }).then(function () { ev.target.reset(); flash('Lista creada', 'ok'); load(); })
        .catch(function (e) { flash(e.message, 'err'); });
    };
    load();
  }

  if (TAB === 'variant-pricing') {
    var dirty = [];
    function renderMatrix(data) {
      var lists = (data.priceLists || []).filter(function (l) { return l.status === 'active' || l.status === 'draft'; });
      var products = data.products || [];
      if (!lists.length) {
        document.getElementById('matrix-wrap').innerHTML = '<div class="alert warn">Crea al menos una Price List (tag) activa.</div>';
        return;
      }
      if (!products.length) {
        document.getElementById('matrix-wrap').innerHTML = '<p class="muted">Sin productos.</p>';
        return;
      }
      var html = '<table class="matrix-table"><thead><tr><th class="sticky">Product / Variant</th>';
      lists.forEach(function (l) { html += '<th><code>' + esc(l.tag) + '</code></th>'; });
      html += '</tr></thead><tbody>';
      products.forEach(function (p) {
        (p.variants || []).forEach(function (v) {
          var label = esc(p.title) + (v.title && v.title !== 'Default Title' ? ' — ' + esc(v.title) : '');
          html += '<tr><td class="sticky"><strong>' + label + '</strong><br/><span class="muted">Q' +
            esc(v.price) + ' · SKU: ' + esc(v.sku || '—') + '</span></td>';
          lists.forEach(function (l) {
            var val = (v.tagPrices && v.tagPrices[l.tag]) || '';
            html += '<td><input class="price-cell" data-variant="' + esc(v.id) +
              '" data-product="' + esc(p.id) + '" data-sku="' + esc(v.sku || '') +
              '" data-tag="' + esc(l.tag) + '" data-base="' + esc(v.price) +
              '" value="' + esc(val) + '" placeholder="Q" />' +
              '<div class="pct muted" data-for-tag="' + esc(l.tag) + '">' +
              (val ? pct(v.price, val) : '0.00%') + '</div></td>';
          });
          html += '</tr>';
        });
      });
      html += '</tbody></table>';
      document.getElementById('matrix-wrap').innerHTML = html;
      dirty = [];
      document.querySelectorAll('.price-cell').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var base = inp.getAttribute('data-base');
          var pctEl = inp.parentNode.querySelector('.pct');
          if (pctEl) pctEl.textContent = inp.value ? pct(base, inp.value) : '0.00%';
          var key = inp.getAttribute('data-variant') + '|' + inp.getAttribute('data-tag');
          dirty = dirty.filter(function (d) { return (d.variantId + '|' + d.tag) !== key; });
          if (inp.value !== '') {
            dirty.push({
              variantId: inp.getAttribute('data-variant'),
              productId: inp.getAttribute('data-product'),
              sku: inp.getAttribute('data-sku') || null,
              tag: inp.getAttribute('data-tag'),
              price: inp.value
            });
          }
        });
      });
    }
    document.getElementById('prod-search').onsubmit = function (ev) {
      ev.preventDefault();
      var q = new FormData(ev.target).get('q');
      api('/products?q=' + encodeURIComponent(q || '')).then(function (res) {
        renderMatrix(res.data || {});
      }).catch(function (e) { flash(e.message, 'err'); });
    };
    document.getElementById('btn-save-matrix').onclick = function () {
      if (!dirty.length) { flash('No hay cambios', 'warn'); return; }
      api('/prices/matrix', {
        method: 'PUT',
        body: JSON.stringify({ prices: dirty })
      }).then(function (res) {
        flash('Guardado: +' + res.data.created + ' ~' + res.data.updated, 'ok');
        dirty = [];
      }).catch(function (e) { flash(e.message, 'err'); });
    };
  }

  if (TAB === 'import') {
    function downloadBase64(b64, filename, mime) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    var importPending = null;
    var PREVIEW_MAX_ROWS = 40;
    var PREVIEW_MAX_COLS = 24;

    function setImportStatus(msg, kind) {
      var el = document.getElementById('import-status');
      if (el) {
        if (!msg) {
          el.style.display = 'none';
          el.textContent = '';
          el.className = 'alert';
        } else {
          el.style.display = 'block';
          el.className = 'alert ' + (kind || 'ok');
          el.textContent = msg;
        }
      }
      flash(msg || '', kind || 'ok');
    }

    function rememberPending(pending) {
      importPending = pending || null;
      try { window.__syspricingImportPending = importPending; } catch (e) {}
    }

    function parseCsvPreview(text) {
      var rows = [];
      var i = 0;
      var cur = '';
      var row = [];
      var inQuotes = false;
      var s = String(text || '').replace(/^\\uFEFF/, '');
      while (i < s.length) {
        var ch = s[i];
        if (inQuotes) {
          if (ch === '"') {
            if (s[i + 1] === '"') { cur += '"'; i += 2; continue; }
            inQuotes = false; i += 1; continue;
          }
          cur += ch; i += 1; continue;
        }
        if (ch === '"') { inQuotes = true; i += 1; continue; }
        if (ch === ',') { row.push(cur); cur = ''; i += 1; continue; }
        if (ch === '\\n') {
          row.push(cur); rows.push(row); row = []; cur = ''; i += 1; continue;
        }
        if (ch === '\\r') { i += 1; continue; }
        cur += ch; i += 1;
      }
      if (cur.length || row.length) { row.push(cur); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (c) { return String(c || '').trim() !== ''; }); });
    }

    function loadXlsxLib() {
      if (window.XLSX) return Promise.resolve(window.XLSX);
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-syspricing-xlsx]');
        if (existing) {
          existing.addEventListener('load', function () { resolve(window.XLSX); });
          existing.addEventListener('error', function () { reject(new Error('No se pudo cargar SheetJS')); });
          return;
        }
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.async = true;
        s.dataset.syspricingXlsx = '1';
        s.onload = function () { resolve(window.XLSX); };
        s.onerror = function () { reject(new Error('No se pudo cargar SheetJS')); };
        document.head.appendChild(s);
      });
    }

    function arrayBufferToBase64(buf) {
      var bytes = new Uint8Array(buf);
      var chunk = 0x8000;
      var binary = '';
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    function clearImportPreview() {
      rememberPending(null);
      var fileInput = document.getElementById('import-file');
      if (fileInput) fileInput.value = '';
      var meta = document.getElementById('import-file-meta');
      var wrap = document.getElementById('import-preview-wrap');
      var note = document.getElementById('import-preview-note');
      var actions = document.getElementById('import-actions');
      var result = document.getElementById('csv-result');
      var scrollHint = document.getElementById('import-scroll-hint');
      if (meta) { meta.style.display = 'none'; meta.innerHTML = ''; }
      if (wrap) wrap.style.display = 'none';
      if (note) { note.style.display = 'none'; note.textContent = ''; }
      if (actions) actions.style.display = 'none';
      if (result) { result.style.display = 'none'; result.textContent = ''; }
      if (scrollHint) scrollHint.hidden = true;
      setImportStatus('', 'ok');
      var zone = document.getElementById('import-dropzone');
      if (zone) zone.classList.remove('has-file');
      var runBtn = document.getElementById('btn-run-import');
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Importar'; }
    }

    function renderImportPreview(aoa, fileName, kind) {
      var headers = (aoa[0] || []).map(function (h) { return String(h == null ? '' : h); });
      var dataRows = aoa.slice(1);
      var showCols = Math.min(headers.length || (dataRows[0] || []).length, PREVIEW_MAX_COLS);
      var showRows = dataRows.slice(0, PREVIEW_MAX_ROWS);
      var table = document.getElementById('import-preview');
      var thead = table.querySelector('thead');
      var tbody = table.querySelector('tbody');
      var headHtml = '<tr>';
      for (var c = 0; c < showCols; c++) {
        headHtml += '<th>' + esc(headers[c] || ('Col ' + (c + 1))) + '</th>';
      }
      if ((headers.length || (dataRows[0] || []).length) > PREVIEW_MAX_COLS) {
        headHtml += '<th>…</th>';
      }
      headHtml += '</tr>';
      thead.innerHTML = headHtml;
      var bodyHtml = '';
      showRows.forEach(function (row) {
        bodyHtml += '<tr>';
        for (var j = 0; j < showCols; j++) {
          bodyHtml += '<td>' + esc(row[j] == null ? '' : row[j]) + '</td>';
        }
        if ((headers.length || row.length) > PREVIEW_MAX_COLS) bodyHtml += '<td>…</td>';
        bodyHtml += '</tr>';
      });
      tbody.innerHTML = bodyHtml || '<tr><td colspan="' + Math.max(showCols, 1) + '" class="muted">Sin filas de datos</td></tr>';

      document.getElementById('import-preview-wrap').style.display = 'block';
      document.getElementById('import-actions').style.display = 'flex';
      var scrollHint = document.getElementById('import-scroll-hint');
      if (scrollHint) scrollHint.hidden = false;
      var meta = document.getElementById('import-file-meta');
      meta.style.display = 'flex';
      meta.innerHTML = '<span><i class="fa-solid fa-file' + (kind === 'xlsx' ? '-excel' : '-csv') + '"></i> <strong>' +
        esc(fileName) + '</strong></span><span class="muted">' + esc(kind.toUpperCase()) + ' · ' +
        dataRows.length + ' filas · ' + (headers.length || showCols) + ' columnas</span>';

      var note = document.getElementById('import-preview-note');
      note.style.display = 'block';
      var parts = [];
      if (dataRows.length > PREVIEW_MAX_ROWS) parts.push('mostrando las primeras ' + PREVIEW_MAX_ROWS + ' filas');
      if ((headers.length || 0) > PREVIEW_MAX_COLS) parts.push('primeras ' + PREVIEW_MAX_COLS + ' columnas');
      note.textContent = parts.length
        ? 'Vista previa (' + parts.join(', ') + '). Revisa y pulsa Importar.'
        : 'Vista previa completa. Revisa y pulsa Importar.';

      var zone = document.getElementById('import-dropzone');
      if (zone) zone.classList.add('has-file');
    }

    function setImportPendingFromFile(file) {
      if (!file) return;
      var name = file.name || 'archivo';
      var mime = String(file.type || '').toLowerCase();
      // Inside Node template literal: /\\.xlsx?/ becomes /\.xlsx?/ in the browser
      var isXlsx = /\\.xlsx?$/i.test(name) ||
        mime.indexOf('spreadsheet') >= 0 ||
        mime.indexOf('excel') >= 0 ||
        mime === 'application/vnd.ms-excel';
      clearImportPreview();
      setImportStatus('Leyendo ' + name + '…', 'ok');

      if (isXlsx) {
        var reader = new FileReader();
        reader.onload = function () {
          var buf = reader.result;
          loadXlsxLib().then(function (XLSX) {
            var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
            var sheetName = wb.SheetNames[0];
            var sheet = wb.Sheets[sheetName];
            var aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
            rememberPending({
              kind: 'xlsx',
              name: name,
              xlsxBase64: arrayBufferToBase64(buf),
              rows: aoa.length ? aoa.length - 1 : 0
            });
            renderImportPreview(aoa, name, 'xlsx');
            setImportStatus('Archivo listo. Pulsa Importar.', 'ok');
          }).catch(function (e) {
            setImportStatus(e.message || String(e), 'err');
          });
        };
        reader.onerror = function () { setImportStatus('No se pudo leer el archivo', 'err'); };
        reader.readAsArrayBuffer(file);
        return;
      }

      var textReader = new FileReader();
      textReader.onload = function () {
        var text = String(textReader.result || '');
        var aoa = parseCsvPreview(text);
        rememberPending({ kind: 'csv', name: name, csv: text, rows: Math.max(aoa.length - 1, 0) });
        renderImportPreview(aoa, name, 'csv');
        setImportStatus('Archivo listo. Pulsa Importar.', 'ok');
      };
      textReader.onerror = function () { setImportStatus('No se pudo leer el archivo', 'err'); };
      textReader.readAsText(file);
    }

    var dropzone = document.getElementById('import-dropzone');
    var importFileInput = document.getElementById('import-file');
    var pickBtn = document.getElementById('btn-pick-import');
    if (pickBtn && importFileInput) {
      pickBtn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        importFileInput.click();
      };
    }
    if (dropzone && importFileInput) {
      dropzone.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('#btn-pick-import')) return;
        importFileInput.click();
      });
      dropzone.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', function (ev) {
        ev.preventDefault();
        dropzone.classList.remove('dragover');
        var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (file) setImportPendingFromFile(file);
      });
      importFileInput.onchange = function () {
        var file = importFileInput.files && importFileInput.files[0];
        if (file) setImportPendingFromFile(file);
      };
    }

    var clearImportBtn = document.getElementById('btn-clear-import');
    if (clearImportBtn) {
      clearImportBtn.onclick = function () {
        clearImportPreview();
        setImportStatus('Archivo quitado', 'ok');
      };
    }

    function runImportNow() {
      var pending = importPending || window.__syspricingImportPending || null;
      var runBtn = document.getElementById('btn-run-import');
      if (!pending) {
        setImportStatus('Elige un archivo primero', 'warn');
        return;
      }
      var body = pending.kind === 'xlsx'
        ? { xlsxBase64: pending.xlsxBase64 }
        : { csv: pending.csv };
      if (pending.kind === 'xlsx' && !pending.xlsxBase64) {
        setImportStatus('El Excel no se leyó bien. Vuelve a elegirlo.', 'err');
        return;
      }
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = 'Importando…';
      }
      setImportStatus('Importando ' + (pending.name || 'archivo') + '…', 'ok');
      api('/import/csv', {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify(body)
      })
        .then(function (res) {
          var d = res.data || {};
          var msg = 'Import completado: +' + (d.created || 0) + ' ~' + (d.updated || 0);
          if (d.listsCreated && d.listsCreated.length) {
            msg += ' · listas nuevas: ' + d.listsCreated.join(', ');
          }
          if (d.syncQueued) msg += ' · sync Shopify en segundo plano';
          if (d.errors && d.errors.length) msg += ' · ' + d.errors.length + ' avisos';
          setImportStatus(msg, d.errors && d.errors.length ? 'warn' : 'ok');
          var el = document.getElementById('csv-result');
          if (el) {
            el.style.display = 'block';
            el.textContent = JSON.stringify(d, null, 2);
          }
        })
        .catch(function (e) {
          setImportStatus(e.message || 'Error al importar', 'err');
        })
        .then(function () {
          if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = 'Importar';
          }
        });
    }

    window.__syspricingRunImport = runImportNow;

    var runImportBtn = document.getElementById('btn-run-import');
    if (runImportBtn) {
      runImportBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        runImportNow();
      });
    }

    var collectionState = { items: [], selected: {} };

    function pathPartsForCollection(c) {
      var handle = String((c && c.handle) || '').trim();
      if (handle && handle.indexOf('/') >= 0) {
        return handle.split('/').map(function (p) { return p.trim(); }).filter(Boolean);
      }
      var title = String((c && c.title) || '').trim();
      if (title.indexOf(' > ') >= 0) {
        return title.split(' > ').map(function (p) { return p.trim(); }).filter(Boolean);
      }
      if (title.indexOf('/') >= 0) {
        return title.split('/').map(function (p) { return p.trim(); }).filter(Boolean);
      }
      return [title || handle || 'Colección'];
    }

    function buildCollectionTree(items) {
      var root = { name: 'Colecciones', folders: {}, leaves: [] };
      (items || []).forEach(function (c) {
        var parts = pathPartsForCollection(c);
        if (parts.length <= 1) {
          root.leaves.push({ collection: c, label: parts[0] || c.title });
          return;
        }
        var node = root;
        for (var i = 0; i < parts.length - 1; i++) {
          var key = parts[i].toLowerCase();
          if (!node.folders[key]) node.folders[key] = { name: parts[i], folders: {}, leaves: [] };
          node = node.folders[key];
        }
        node.leaves.push({ collection: c, label: parts[parts.length - 1] });
      });
      return root;
    }

    function syncFolderCheckbox(folderEl) {
      if (!folderEl) return;
      var boxes = folderEl.querySelectorAll(':scope > .tree-children .tree-leaf input[type=checkbox]');
      if (!boxes.length) return;
      var checked = 0;
      boxes.forEach(function (b) { if (b.checked) checked += 1; });
      var folderBox = folderEl.querySelector(':scope > .tree-row > label > input[type=checkbox]');
      if (!folderBox) return;
      folderBox.checked = checked > 0 && checked === boxes.length;
      folderBox.indeterminate = checked > 0 && checked < boxes.length;
    }

    function syncAllFolders(rootEl) {
      var folders = rootEl.querySelectorAll('.tree-folder');
      for (var i = folders.length - 1; i >= 0; i--) syncFolderCheckbox(folders[i]);
    }

    function updateSelectionHint() {
      var hint = document.getElementById('collection-selection-hint');
      if (!hint) return;
      var ids = getSelectedCollectionIds();
      if (!ids.length) {
        hint.textContent = 'Sin selección = todo el catálogo. Marca una o varias colecciones para exportar solo esas.';
      } else {
        hint.textContent = ids.length + ' colección(es) seleccionada(s).';
      }
    }

    function getSelectedCollectionIds() {
      var root = document.getElementById('collection-tree');
      if (!root) return [];
      return Array.prototype.slice.call(root.querySelectorAll('.tree-leaf input[type=checkbox]:checked'))
        .map(function (el) { return el.value; })
        .filter(Boolean);
    }

    function renderCollectionTree(items, filterText) {
      var mount = document.getElementById('collection-tree');
      if (!mount) return;
      var q = String(filterText || '').trim().toLowerCase();
      var filtered = (items || []).filter(function (c) {
        if (!q) return true;
        var hay = ((c.title || '') + ' ' + (c.handle || '')).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
      if (!filtered.length) {
        mount.innerHTML = '<p class="muted">' + (q ? 'Sin coincidencias.' : 'No hay colecciones.') + '</p>';
        updateSelectionHint();
        return;
      }

      var tree = buildCollectionTree(filtered);
      var openByDefault = Boolean(q) || filtered.length <= 40;

      function renderNode(node, depth) {
        var html = '';
        var folderKeys = Object.keys(node.folders || {}).sort(function (a, b) {
          return node.folders[a].name.localeCompare(node.folders[b].name, 'es');
        });
        folderKeys.forEach(function (key) {
          var folder = node.folders[key];
          var open = openByDefault || depth < 1;
          html += '<div class="tree-folder' + (open ? ' is-open' : '') + '" data-depth="' + depth + '">';
          html += '<div class="tree-row">';
          html += '<button type="button" class="tree-toggle" aria-label="Expandir/colapsar"><i class="fa-solid fa-caret-right"></i></button>';
          html += '<label class="tree-label"><input type="checkbox" class="tree-folder-check" /> ';
          html += '<span class="tree-name"><i class="fa-regular fa-folder tree-icon"></i> ' + esc(folder.name) + '</span></label>';
          html += '</div><div class="tree-children">';
          html += renderNode(folder, depth + 1);
          html += '</div></div>';
        });

        var leaves = (node.leaves || []).slice().sort(function (a, b) {
          return String(a.label || '').localeCompare(String(b.label || ''), 'es');
        });
        leaves.forEach(function (leaf) {
          var c = leaf.collection;
          var checked = collectionState.selected[c.id] ? ' checked' : '';
          var count = c.productsCount != null ? ' <span class="tree-count">(' + esc(String(c.productsCount)) + ')</span>' : '';
          html += '<div class="tree-leaf" data-depth="' + depth + '">';
          html += '<div class="tree-row">';
          html += '<span class="tree-toggle-spacer"></span>';
          html += '<label class="tree-label"><input type="checkbox" value="' + esc(c.id) + '"' + checked + ' /> ';
          html += '<span class="tree-name"><i class="fa-regular fa-file-lines tree-icon"></i> ' + esc(leaf.label || c.title) + count + '</span></label>';
          html += '</div></div>';
        });
        return html;
      }

      var body = ''
        + '<div class="tree-folder is-open tree-root" data-depth="0">'
        + '<div class="tree-row">'
        + '<button type="button" class="tree-toggle" aria-label="Expandir/colapsar"><i class="fa-solid fa-caret-right"></i></button>'
        + '<label class="tree-label"><input type="checkbox" class="tree-folder-check" /> '
        + '<span class="tree-name"><i class="fa-regular fa-folder-open tree-icon"></i> Colecciones</span></label>'
        + '</div><div class="tree-children">'
        + renderNode(tree, 1)
        + '</div></div>';
      mount.innerHTML = body;
      syncAllFolders(mount);
      updateSelectionHint();
    }

    function loadCollections() {
      var mount = document.getElementById('collection-tree');
      if (!mount) return Promise.resolve();
      return api('/collections?first=250').then(function (res) {
        collectionState.items = res.data || [];
        var filterEl = document.getElementById('collection-filter');
        renderCollectionTree(collectionState.items, filterEl && filterEl.value);
      }).catch(function (e) {
        mount.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>';
        flash('Colecciones: ' + e.message, 'err');
      });
    }

    var treeMount = document.getElementById('collection-tree');
    if (treeMount) {
      treeMount.addEventListener('click', function (ev) {
        var toggle = ev.target.closest && ev.target.closest('.tree-toggle');
        if (toggle) {
          ev.preventDefault();
          var folder = toggle.closest('.tree-folder');
          if (folder) folder.classList.toggle('is-open');
          return;
        }
      });
      treeMount.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.type !== 'checkbox') return;
        var folder = input.closest('.tree-folder');
        if (input.classList.contains('tree-folder-check')) {
          var boxes = folder
            ? folder.querySelectorAll(':scope > .tree-children .tree-leaf input[type=checkbox]')
            : [];
          boxes.forEach(function (b) {
            b.checked = input.checked;
            if (b.value) collectionState.selected[b.value] = b.checked;
          });
          // also nested folder checks visual
          if (folder) {
            folder.querySelectorAll(':scope > .tree-children .tree-folder-check').forEach(function (b) {
              b.checked = input.checked;
              b.indeterminate = false;
            });
          }
        } else if (input.value) {
          collectionState.selected[input.value] = input.checked;
        }
        syncAllFolders(treeMount);
        updateSelectionHint();
      });
    }

    var filterInput = document.getElementById('collection-filter');
    if (filterInput) {
      filterInput.addEventListener('input', function () {
        renderCollectionTree(collectionState.items, filterInput.value);
      });
    }

    var expandBtn = document.getElementById('btn-expand-collections');
    if (expandBtn) {
      expandBtn.onclick = function () {
        document.querySelectorAll('#collection-tree .tree-folder').forEach(function (el) {
          el.classList.add('is-open');
        });
      };
    }
    var collapseBtn = document.getElementById('btn-collapse-collections');
    if (collapseBtn) {
      collapseBtn.onclick = function () {
        document.querySelectorAll('#collection-tree .tree-folder').forEach(function (el) {
          if (!el.classList.contains('tree-root')) el.classList.remove('is-open');
        });
      };
    }

    var refreshCollectionsBtn = document.getElementById('btn-refresh-collections');
    if (refreshCollectionsBtn) {
      refreshCollectionsBtn.onclick = function () {
        refreshCollectionsBtn.disabled = true;
        loadCollections().then(function () {
          refreshCollectionsBtn.disabled = false;
        });
      };
    }
    loadCollections();

    var exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.onclick = function () {
        var collectionIds = getSelectedCollectionIds();
        var body = collectionIds.length
          ? { collectionIds: collectionIds, format: 'xlsx' }
          : { all: true, format: 'xlsx' };
        exportBtn.disabled = true;
        api('/export/csv', {
          method: 'POST',
          body: JSON.stringify(body)
        }).then(function (res) {
          var meta = (res.data && res.data.meta) || {};
          downloadBase64(
            res.data.xlsxBase64,
            meta.filename || 'syspricing-individual-pricing.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          var scope = meta.collection && meta.collection.title
            ? meta.collection.title
            : 'catálogo';
          flash('Export (' + scope + '): ' + (meta.variants || 0) + ' variantes, ' + (meta.prices || 0) + ' precios', 'ok');
        }).catch(function (e) { flash(e.message, 'err'); })
          .then(function () { exportBtn.disabled = false; });
      };
    }
  }

  if (TAB === 'customers') {
    document.getElementById('cust-search').onsubmit = function (ev) {
      ev.preventDefault();
      var q = new FormData(ev.target).get('q');
      api('/customers?q=' + encodeURIComponent(q || '')).then(function (res) {
        var rows = res.data || [];
        var html = '<table><thead><tr><th>Cliente</th><th>Email</th><th>Tags</th><th>Price Lists</th></tr></thead><tbody>';
        rows.forEach(function (c) {
          var tags = (c.tags || []).map(function (t) { return '<code>' + esc(t) + '</code>'; }).join(' ');
          var matched = (c.matchedPriceLists || []).map(function (pl) {
            return '<code>' + esc(pl.tag) + '</code> (p' + esc(pl.priority) + ')';
          }).join(', ') || '—';
          html += '<tr><td>' + esc(c.displayName) + '</td><td>' + esc(c.email || '—') +
            '</td><td>' + (tags || '—') + '</td><td>' + matched + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('cust-list').innerHTML = rows.length ? html : '<p class="muted">Sin resultados.</p>';
      }).catch(function (e) { flash(e.message, 'err'); });
    };
  }

  if (TAB === 'activity') {
    api('/activity?limit=100').then(function (res) {
      var rows = res.data || [];
      var html = '<table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead><tbody>';
      rows.forEach(function (a) {
        html += '<tr><td>' + esc(a.createdAt) + '</td><td><code>' + esc(a.action) + '</code></td><td>' +
          esc(a.entityType) + ' ' + esc(a.entityId || '') + '</td><td>' + esc(a.actor) + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('act-list').innerHTML = rows.length ? html : '<p class="muted">Sin actividad.</p>';
    }).catch(function (e) {
      document.getElementById('act-list').innerHTML = '<div class="alert err">' + esc(e.message) + '</div>';
    });
  }
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="shopify-api-key" content="${escapeHtml(apiKey)}" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <style>
    :root {
      --bg: #f6f6f7; --surface: #ffffff; --text: #202223; --muted: #6d7175;
      --border: #e1e3e5; --accent: #008060; --header-text: #ffffff;
      --warn-bg: #fff5ea; --warn-bd: #f1c78e; --ok-bg: #eaf7f0; --ok-bd: #aee0bf;
      --err-bg: #fef1f1; --err-bd: #f0b4b4;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--text); line-height:1.45; }
    .main-header { background: linear-gradient(135deg, #0b1f33 0%, #12324d 55%, #0d6b56 100%); color:var(--header-text); padding:1rem 0; box-shadow:0 2px 10px rgba(0,0,0,0.18); }
    .main-header .container { max-width:1200px; margin:0 auto; padding:0 1.25rem; }
    .main-header .row { display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
    .main-header .col-title { flex:1 1 16rem; }
    .main-header .col-shop { margin-left:auto; }
    .header-logo { height:48px; width:auto; max-width:160px; object-fit:contain; filter:brightness(0) invert(1); }
    .main-header h1 { margin:0; font-size:1.35rem; font-weight:700; display:flex; align-items:center; gap:0.5rem; }
    .main-header .subtitle { margin:0.2rem 0 0; font-size:0.92rem; color:rgba(255,255,255,0.78); }
    .shop-badge { display:inline-flex; align-items:center; gap:0.4rem; background:rgba(255,255,255,0.94); color:#202223; border-radius:999px; padding:0.4rem 0.85rem; font-size:0.88rem; font-weight:600; }
    .shop-badge i { color:var(--accent); }
    .shell { max-width:1200px; margin:0 auto; padding:1rem 1.25rem 2rem; }
    .tabs { display:flex; gap:0.35rem; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:1rem; padding-bottom:0.35rem; }
    .tab { text-decoration:none; color:var(--muted); font-weight:600; font-size:0.92rem; padding:0.55rem 0.85rem; border-radius:8px 8px 0 0; }
    .tab:hover { background:#eceef0; color:var(--text); }
    .tab.active { background:var(--surface); color:var(--accent); box-shadow:inset 0 -2px 0 var(--accent); }
    .panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:1.1rem 1.2rem; }
    h2 { margin:0 0 0.35rem; font-size:1.15rem; }
    .section-title { margin:1.1rem 0 0.55rem; font-size:1rem; font-weight:700; }
    .muted { color:var(--muted); }
    .card { border:1px solid var(--border); border-radius:8px; padding:1rem; margin-top:0.85rem; background:#fafbfb; }
    .grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:0.75rem; }
    code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:#f1f2f3; padding:0.1rem 0.35rem; border-radius:4px; font-size:0.88em; }
    .alert { padding:0.7rem 0.85rem; border-radius:8px; margin-bottom:0.85rem; border:1px solid transparent; }
    .alert.warn { background:var(--warn-bg); border-color:var(--warn-bd); }
    .alert.ok { background:var(--ok-bg); border-color:var(--ok-bd); }
    .alert.err { background:var(--err-bg); border-color:var(--err-bd); }
    .form-row { display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; margin:0.85rem 0; }
    .form-row input, .form-row select, textarea { font:inherit; padding:0.5rem 0.65rem; border:1px solid var(--border); border-radius:6px; min-height:2.5rem; }
    .form-row button, button[type=submit] { background:var(--accent); color:#fff; border:none; border-radius:6px; font-weight:600; padding:0.5rem 0.9rem; cursor:pointer; min-height:2.5rem; }
    .input-grow { flex:1 1 12rem; min-width:0; width:auto; }
    .input-sm { flex:0 0 auto; width:5rem; max-width:5rem; }
    .drop-mobile { display:none; }
    button.btn-secondary,
    .btn-secondary {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:0.35rem;
      background:var(--accent) !important;
      color:#fff !important;
      border:none !important;
      border-radius:6px;
      font:inherit;
      font-weight:600;
      font-size:0.92rem;
      line-height:1.25;
      padding:0.5rem 0.9rem;
      cursor:pointer;
      text-decoration:none;
      appearance:none;
      -webkit-appearance:none;
    }
    button.btn-secondary:hover,
    .btn-secondary:hover { filter:brightness(0.94); }
    .btn-sm { padding:0.25rem 0.55rem; font-size:0.8rem; }
    .btn-danger { display:inline-flex; align-items:center; background:#d72c0d; color:#fff; border:none; border-radius:6px; font-weight:600; padding:0.5rem 0.9rem; cursor:pointer; }
    .collection-tree {
      border:1px solid var(--border);
      border-radius:8px;
      background:#fafbfb;
      max-height:22rem;
      overflow:auto;
      padding:0.45rem 0.35rem;
      font-size:0.92rem;
    }
    .collection-tree .tree-row {
      display:flex;
      align-items:center;
      gap:0.25rem;
      padding:0.18rem 0.35rem;
      border-radius:6px;
      min-height:1.7rem;
    }
    .collection-tree .tree-row:hover { background:#eef2f4; }
    .collection-tree .tree-label {
      display:inline-flex;
      align-items:center;
      gap:0.4rem;
      cursor:pointer;
      flex:1;
      min-width:0;
      margin:0;
      font-weight:500;
    }
    .collection-tree .tree-name {
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .collection-tree .tree-count { color:var(--muted); font-weight:500; }
    .collection-tree .tree-icon { color:#6d7175; width:1rem; text-align:center; }
    .collection-tree .tree-toggle {
      width:1.35rem;
      height:1.35rem;
      border:none;
      background:transparent;
      color:#5c5f62;
      cursor:pointer;
      border-radius:4px;
      padding:0;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex:0 0 auto;
    }
    .collection-tree .tree-toggle:hover { background:#e4e7ea; }
    .collection-tree .tree-toggle i {
      transition: transform 0.12s ease;
      font-size:0.75rem;
    }
    .collection-tree .tree-folder.is-open > .tree-row .tree-toggle i {
      transform: rotate(90deg);
    }
    .collection-tree .tree-folder:not(.is-open) > .tree-children { display:none; }
    .collection-tree .tree-children { margin-left:1.1rem; border-left:1px solid #e1e3e5; padding-left:0.15rem; }
    .collection-tree .tree-toggle-spacer { width:1.35rem; flex:0 0 auto; }
    .collection-tree input[type=checkbox] { width:1rem; height:1rem; accent-color:var(--accent); cursor:pointer; }
    .import-dropzone {
      border:1.5px dashed #c9ccd0;
      border-radius:10px;
      background:#fafbfb;
      padding:1.25rem 1rem;
      text-align:center;
      cursor:pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .import-dropzone:hover, .import-dropzone.dragover {
      border-color:var(--accent);
      background:#f1faf6;
    }
    .import-dropzone.has-file { border-style:solid; border-color:#aee0bf; }
    .import-dropzone-inner i { font-size:1.6rem; color:var(--accent); margin-bottom:0.35rem; }
    .import-dropzone-inner p { margin:0.2rem 0; }
    .import-dropzone .linkish {
      background:none; border:none; color:var(--accent); font:inherit; font-weight:700;
      text-decoration:underline; cursor:pointer; padding:0;
    }
    .import-file-meta {
      display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center;
      margin:0.65rem 0 0.35rem; font-size:0.92rem;
    }
    .import-file-meta i { color:var(--accent); margin-right:0.25rem; }
    .import-preview-wrap {
      border:1px solid var(--border); border-radius:8px; background:#fff;
      max-height:18rem; margin-top:0.35rem;
    }
    .import-preview-table { min-width:640px; font-size:0.84rem; }
    .import-preview-table th {
      position:sticky; top:0; background:#f3f4f5; z-index:1;
      white-space:nowrap; max-width:10rem; overflow:hidden; text-overflow:ellipsis;
    }
    .import-preview-table td {
      white-space:nowrap; max-width:10rem; overflow:hidden; text-overflow:ellipsis;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.8rem;
    }
    .table-wrap { overflow:auto; margin-top:0.75rem; max-width:100%; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; }
    table { width:100%; border-collapse:collapse; font-size:0.92rem; }
    th, td { text-align:left; padding:0.55rem 0.45rem; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--muted); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.03em; }
    .matrix-table { min-width:720px; }
    .matrix-table .sticky { position:sticky; left:0; background:#fafbfb; z-index:1; min-width:14rem; }
    .price-cell { width:5.5rem; max-width:100%; font:inherit; padding:0.35rem 0.45rem; border:1px solid var(--border); border-radius:6px; min-height:2.35rem; }
    .pct { font-size:0.75rem; margin-top:0.2rem; }
    .main-footer { max-width:1200px; margin:2.5rem auto 0; padding:0 1.25rem 2rem; }
    .main-footer .footer-inner { text-align:center; border-top:1px solid var(--border); padding-top:1.5rem; }
    .footer-logo { height:40px; width:auto; max-width:140px; object-fit:contain; opacity:0.92; }
    .main-footer p { color:var(--muted); margin:0.75rem 0 0; font-size:0.92rem; }
    .main-footer strong { color:var(--text); }
    .main-footer .fa-heart { color:#d92d20; }
    /* Home */
    .home-hero { display:flex; gap:1.25rem; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; margin-bottom:1rem; }
    .eyebrow { margin:0 0 0.35rem; font-size:0.75rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--accent); }
    .lead { margin:0.45rem 0 0; color:var(--muted); max-width:40rem; }
    .home-ready { display:flex; gap:0.85rem; align-items:center; background:linear-gradient(135deg,#f3faf7,#eef6ff); border:1px solid var(--border); border-radius:12px; padding:0.85rem 1rem; min-width:14rem; }
    .ready-ring { width:3rem; height:3rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; background:#fff; border:3px solid #c9e6d8; color:var(--accent); }
    .ready-ring.ready { border-color:var(--accent); background:var(--ok-bg); }
    .ready-ring.partial { border-color:#f1c78e; color:#8a5a00; background:var(--warn-bg); }
    .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:0.75rem; margin:0.5rem 0 1rem; }
    .stat-card { background:#fafbfb; border:1px solid var(--border); border-radius:10px; padding:0.85rem 1rem; display:flex; flex-direction:column; gap:0.25rem; }
    .stat-label { font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-weight:600; }
    .stat-value { font-size:1.55rem; font-weight:800; color:var(--text); line-height:1.1; }
    .home-grid { display:grid; grid-template-columns:1.15fr 1fr; gap:0.85rem; }
    .home-section { border:1px solid var(--border); border-radius:10px; padding:1rem 1.1rem; background:#fafbfb; }
    .home-section h3 { margin:0 0 0.65rem; font-size:1rem; display:flex; align-items:center; gap:0.45rem; }
    .home-section h3 i { color:var(--accent); }
    .checklist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.75rem; }
    .checklist li { display:flex; gap:0.65rem; align-items:flex-start; }
    .checklist p { margin:0.2rem 0 0.35rem; }
    .check-dot { width:1.1rem; height:1.1rem; border-radius:50%; border:2px solid #c4cdd5; flex:0 0 auto; margin-top:0.15rem; background:#fff; }
    .check-dot.ok { border-color:var(--accent); background:var(--accent); box-shadow:inset 0 0 0 2px #fff; }
    .check-dot.pending { border-style:dashed; }
    .link-btn { color:var(--accent); font-weight:600; font-size:0.88rem; text-decoration:none; }
    .link-btn:hover { text-decoration:underline; }
    .home-actions { display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:1rem; align-items:center; }
    .home-actions .btn-secondary,
    .home-actions .btn-ghost { min-height:2.25rem; }
    .btn-ghost { display:inline-flex; align-items:center; padding:0.5rem 0.85rem; border-radius:6px; border:1px solid var(--border); background:#fff; color:var(--text); font-weight:600; text-decoration:none; font-size:0.92rem; line-height:1.25; }
    .btn-ghost:hover { background:#f1f2f3; }
    .steps { margin:0.5rem 0 0.85rem; padding-left:1.2rem; color:var(--muted); }
    .steps li { margin:0.3rem 0; }
    .tiny { font-size:0.82rem; }
    .tag-cloud { display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.75rem; }
    .tag-pill { display:inline-flex; align-items:center; gap:0.35rem; background:#fff; border:1px solid var(--border); border-radius:999px; padding:0.25rem 0.65rem; font-size:0.8rem; font-weight:600; }
    .tag-pill span { color:var(--muted); font-weight:500; }
    .flow-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:0.65rem; }
    .flow-step { background:#fff; border:1px solid var(--border); border-radius:8px; padding:0.75rem; }
    .flow-step p { margin:0.3rem 0 0; }
    .flow-n { display:inline-flex; width:1.4rem; height:1.4rem; align-items:center; justify-content:center; border-radius:50%; background:var(--accent); color:#fff; font-size:0.75rem; font-weight:800; margin-bottom:0.35rem; }
    .section-head { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.5rem; }
    .section-head h3 { margin:0; }
    .activity-mini td { font-size:0.85rem; }
    .scroll-hint { display:none; margin:0.35rem 0 0; font-size:0.78rem; color:var(--muted); }
    @media (max-width:860px) {
      .main-header { padding:0.85rem 0; }
      .main-header .container, .shell, .main-footer { padding-left:0.85rem; padding-right:0.85rem; }
      .main-header .row { gap:0.75rem; }
      .main-header .col-title { flex:1 1 100%; order:2; }
      .main-header .col-shop { margin-left:0; order:3; width:100%; }
      .main-header .col-logo { order:1; }
      .main-header h1 { font-size:1.15rem; }
      .header-logo { height:40px; max-width:130px; }
      .shop-badge { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .shell { padding-top:0.85rem; padding-bottom:1.5rem; }
      .tabs {
        flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch;
        gap:0.25rem; margin-left:-0.85rem; margin-right:-0.85rem;
        padding:0 0.85rem 0.45rem; scrollbar-width:thin;
      }
      .tab { flex:0 0 auto; white-space:nowrap; font-size:0.88rem; padding:0.6rem 0.75rem; }
      .panel { padding:0.9rem 0.85rem; border-radius:8px; }
      .home-grid { grid-template-columns:1fr; }
      .home-ready { min-width:0; width:100%; }
      .home-hero { gap:0.85rem; }
      .stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .form-row input, .form-row select, .form-row button, .form-row .btn-secondary, .form-row .btn-ghost,
      .form-row button[type=submit] { flex:1 1 auto; }
      .input-grow { flex:1 1 100%; width:100%; }
      .input-sm { flex:1 1 5rem; width:auto; max-width:none; }
      .export-toolbar .btn-ghost, .export-toolbar .btn-secondary { flex:1 1 calc(50% - 0.5rem); }
      .export-toolbar .btn-secondary { flex:1 1 100%; }
      .matrix-table { min-width:560px; }
      .matrix-table .sticky { min-width:9.5rem; max-width:11rem; }
      .import-preview-table { min-width:480px; }
      .collection-tree { max-height:16rem; }
      .scroll-hint { display:block; }
      .scroll-hint[hidden] { display:none !important; }
      .drop-desktop { display:none; }
      .drop-mobile { display:inline; }
      .home-actions .btn-secondary, .home-actions .btn-ghost { flex:1 1 auto; justify-content:center; }
      .main-footer { margin-top:1.5rem; padding-bottom:1.25rem; }
    }
    @media (max-width:560px) {
      .main-header h1 { font-size:1.05rem; }
      .main-header .subtitle { font-size:0.82rem; }
      .header-logo { height:34px; max-width:110px; }
      .stat-value { font-size:1.25rem; }
      .stat-grid { gap:0.5rem; }
      .stat-card { padding:0.7rem 0.75rem; }
      .home-section { padding:0.85rem; }
      .flow-grid { grid-template-columns:1fr 1fr; }
      .matrix-table { min-width:480px; font-size:0.84rem; }
      .matrix-table .sticky { min-width:8rem; }
      .price-cell { width:4.75rem; padding:0.3rem 0.35rem; }
      .import-dropzone { padding:1rem 0.75rem; }
      .import-preview-wrap { max-height:14rem; }
      .form-row > button,
      .form-row > .btn-secondary,
      .form-row > .btn-ghost,
      .home-actions > .btn-secondary,
      .home-actions > .btn-ghost,
      .export-toolbar > .btn-ghost,
      .export-toolbar > .btn-secondary { width:100%; }
      .export-toolbar .btn-ghost, .export-toolbar .btn-secondary { flex:1 1 100%; }
      .footer-logo { height:32px; max-width:110px; }
    }
    @media (hover:none) and (pointer:coarse) {
      .tab, .btn-secondary, .btn-ghost, .btn-danger, button[type=submit], .form-row button, .linkish, .tree-toggle {
        min-height:2.75rem;
      }
      .collection-tree .tree-row { min-height:2.4rem; }
      .collection-tree input[type=checkbox] { width:1.15rem; height:1.15rem; }
      .price-cell { min-height:2.6rem; font-size:1rem; }
    }
  </style>
</head>
<body>
  <div class="main-header">
    <div class="container">
      <div class="row">
        <div class="col-logo">
          <img src="https://shopifel.capworld.seraphsystems.com/img/SERAPH%20SYSTEMS%20Logo-01.png" alt="Seraph Systems" class="header-logo" />
        </div>
        <div class="col-title">
          <h1><i class="fas fa-tags"></i> ${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <div class="col-shop">
          ${shop ? `<span class="shop-badge"><i class="fas fa-store"></i> ${escapeHtml(shop)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>
  <div class="shell">
    <nav class="tabs">${tabNav}</nav>
    <div class="panel">${panel}</div>
  </div>
  <div class="main-footer">
    <div class="footer-inner">
      <img src="https://shopifel.capworld.seraphsystems.com/img/SERAPH%20SYSTEMS%20Logo-01.png" alt="Seraph Systems" class="footer-logo" />
      <p><strong>Seraph Systems</strong> — SYSPRICING<br /><small>Desarrollado con <i class="fas fa-heart"></i> para Guatemala</small></p>
    </div>
  </div>
  ${clientScript}
</body>
</html>`;
}

function renderInstallLanding({ host, scopes, appTitle }) {
  const title = appTitle || 'SysPricing';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; color: #202223; }
    code { background: #f1f2f3; padding: 0.1rem 0.35rem; border-radius: 4px; }
    input, button { font: inherit; padding: 0.55rem 0.75rem; }
    button { background: #008060; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .muted { color: #6d7175; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">Precios B2B por tag de cliente en Shopify.</p>
  <form method="get" action="/auth">
    <label>Dominio de la tienda<br />
      <input name="shop" placeholder="tienda.myshopify.com" required style="width:100%;margin:0.5rem 0;" />
    </label>
    <button type="submit">Instalar / Autorizar</button>
  </form>
  <p class="muted" style="margin-top:1.5rem;">Host: <code>${escapeHtml(host)}</code></p>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  renderAppPage,
  renderInstallLanding,
};
