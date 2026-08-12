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
        <input name="tag" placeholder="TAG (ej. DPAÑUELOS)" required />
        <input name="name" placeholder="Nombre (opcional)" />
        <input name="currency" value="GTQ" style="max-width:5rem" />
        <input name="priority" type="number" value="0" title="Priority" style="max-width:5rem" />
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
        <input name="q" placeholder="Search product by name, SKU" style="min-width:16rem" />
        <button type="submit">Buscar</button>
        <button type="button" id="btn-save-matrix" class="btn-secondary">Guardar cambios</button>
      </form>
      <div id="matrix-wrap" class="table-wrap matrix"><p class="muted">Busca productos para editar precios.</p></div>
    `;
  } else if (active === 'import') {
    panel = `
      <h2>Importar / Exportar CSV</h2>
      <p class="muted">Columnas: <code>sku</code>, <code>variant_id</code>, <code>tag</code>, <code>price</code> (opcional: <code>compare_at_price</code>).</p>
      <div id="flash"></div>
      <div class="home-actions" style="margin:0 0 0.75rem">
        <button type="button" id="btn-export-csv" class="btn-secondary">Exportar precios</button>
      </div>
      <form id="csv-form">
        <textarea name="csv" rows="12" style="width:100%;font-family:ui-monospace,monospace"
          placeholder="sku,variant_id,tag,price&#10;A3545602,52140925550894,mayorista,80.77"></textarea>
        <button type="submit" style="margin-top:0.75rem">Importar</button>
      </form>
      <pre id="csv-result" class="card" style="display:none;white-space:pre-wrap"></pre>
    `;
  } else if (active === 'customers') {
    panel = `
      <h2>Clientes</h2>
      <p class="muted">Consulta qué listas coinciden con los tags de cada cliente. Los tags se gestionan en Shopify Admin.</p>
      <div id="flash"></div>
      <form id="cust-search" class="form-row">
        <input name="q" placeholder="email, nombre…" style="min-width:14rem" />
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
          .then(function () {
            flash('Tienda preparada. Activa el bloque de precio B2B en el editor del tema.', 'ok');
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
    document.getElementById('csv-form').onsubmit = function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      api('/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csv: fd.get('csv') })
      }).then(function (res) {
        flash('Import completado', 'ok');
        var el = document.getElementById('csv-result');
        el.style.display = 'block';
        el.textContent = JSON.stringify(res.data, null, 2);
      }).catch(function (e) { flash(e.message, 'err'); });
    };

    var exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.onclick = function () {
        exportBtn.disabled = true;
        api('/export/csv', {
          method: 'POST',
          body: JSON.stringify({ all: true })
        }).then(function (res) {
          var csv = (res.data && res.data.csv) || '';
          var name = (res.data && res.data.meta && res.data.meta.filename) || 'syspricing-export.csv';
          var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          flash('Export: ' + ((res.data && res.data.meta && res.data.meta.prices) || 0) + ' precios', 'ok');
          var el = document.getElementById('csv-result');
          if (el) {
            el.style.display = 'block';
            el.textContent = csv.slice(0, 4000) + (csv.length > 4000 ? '\\n…' : '');
          }
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
    .muted { color:var(--muted); }
    .card { border:1px solid var(--border); border-radius:8px; padding:1rem; margin-top:0.85rem; background:#fafbfb; }
    .grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:0.75rem; }
    code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:#f1f2f3; padding:0.1rem 0.35rem; border-radius:4px; font-size:0.88em; }
    .alert { padding:0.7rem 0.85rem; border-radius:8px; margin-bottom:0.85rem; border:1px solid transparent; }
    .alert.warn { background:var(--warn-bg); border-color:var(--warn-bd); }
    .alert.ok { background:var(--ok-bg); border-color:var(--ok-bd); }
    .alert.err { background:var(--err-bg); border-color:var(--err-bd); }
    .form-row { display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; margin:0.85rem 0; }
    .form-row input, .form-row select, textarea { font:inherit; padding:0.5rem 0.65rem; border:1px solid var(--border); border-radius:6px; }
    .form-row button, button[type=submit] { background:var(--accent); color:#fff; border:none; border-radius:6px; font-weight:600; padding:0.5rem 0.9rem; cursor:pointer; }
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
    .table-wrap { overflow:auto; margin-top:0.75rem; max-width:100%; }
    table { width:100%; border-collapse:collapse; font-size:0.92rem; }
    th, td { text-align:left; padding:0.55rem 0.45rem; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--muted); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.03em; }
    .matrix-table { min-width:720px; }
    .matrix-table .sticky { position:sticky; left:0; background:#fafbfb; z-index:1; min-width:14rem; }
    .price-cell { width:5.5rem; font:inherit; padding:0.35rem 0.45rem; border:1px solid var(--border); border-radius:6px; }
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
    @media (max-width:860px) { .home-grid { grid-template-columns:1fr; } }
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
