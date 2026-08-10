'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { SQLiteSessionStorage } = require('@shopify/shopify-app-session-storage-sqlite');
const { ApiVersion } = require('@shopify/shopify-api');
const { renderAppPage, renderInstallLanding, escapeHtml } = require('./presentation/appUi');
const { openDatabase } = require('./infrastructure/db/sqlite');
const { createRepositories } = require('./infrastructure/repositories/sqliteRepositories');
const { createMetafieldSync } = require('./infrastructure/shopify/metafieldSync');
const { createUseCases } = require('./application/useCases');
const { createApiRouter } = require('./interfaces/http/apiRouter');
const { createCustomerApiRouter } = require('./interfaces/http/customerApiRouter');
const { createProxyRouter } = require('./interfaces/http/proxyRouter');
const { ensureMetafieldDefinitions } = require('./infrastructure/shopify/metafieldDefinitions');
const { createCustomersAdmin } = require('./infrastructure/shopify/customersAdmin');
const { createProductsAdmin } = require('./infrastructure/shopify/productsAdmin');

const PORT = Number(process.env.PORT || 3000);
const HOST = (process.env.HOST || process.env.SHOPIFY_APP_URL || 'https://app.example.com').replace(
  /\/$/,
  ''
);
const APP_TITLE = process.env.APP_TITLE || 'SysPricing';
const APP_SUBTITLE = process.env.APP_SUBTITLE || 'B2B Price Engine';
const DEFAULT_SCOPES = 'read_products,write_products,read_customers,write_customers';
const SCOPES = (process.env.SCOPES || DEFAULT_SCOPES)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const API_KEY = process.env.SHOPIFY_API_KEY;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SESSION_DB_PATH = path.join(DATA_DIR, 'sessions.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!API_KEY || !process.env.SHOPIFY_API_SECRET) {
  console.error('Faltan SHOPIFY_API_KEY y/o SHOPIFY_API_SECRET');
  process.exit(1);
}

const shopify = shopifyApp({
  api: {
    apiKey: API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: SCOPES,
    hostName: HOST.replace(/^https?:\/\//, ''),
    apiVersion: ApiVersion.October25,
    isEmbeddedApp: true,
  },
  auth: {
    path: '/auth',
    callbackPath: '/auth/callback',
  },
  sessionStorage: new SQLiteSessionStorage(SESSION_DB_PATH),
});

function normalizeShop(shop) {
  return String(shop || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

async function loadOfflineSession(shop) {
  const normalized = normalizeShop(shop);
  if (!normalized) return null;
  const sessionId = shopify.api.session.getOfflineId(normalized);
  return shopify.config.sessionStorage.loadSession(sessionId);
}

async function getAdminClient(shop) {
  const session = await loadOfflineSession(shop);
  if (!session) return null;
  return new shopify.api.clients.Graphql({ session });
}

async function bootstrap() {
  const db = await openDatabase(DATA_DIR);
  const repos = createRepositories(db);
  const customersAdmin = createCustomersAdmin({ getAdminClient });
  const productsAdmin = createProductsAdmin({ getAdminClient });

  const metafieldSync = createMetafieldSync({
    getAdminClient,
    priceListRepo: repos.priceListRepo,
    variantPriceRepo: repos.variantPriceRepo,
    ensureMetafieldDefinitions,
  });

  const useCases = createUseCases({
    ...repos,
    metafieldSync,
    customersAdmin,
    productsAdmin,
  });

  return { db, useCases, customersAdmin };
}

function setEmbeddedCsp(res, shop) {
  if (shop) {
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors https://${shop} https://admin.shopify.com https://*.spin.dev https://admin.myshopify.io https://admin.shop.dev;`
    );
  }
}

function authUrlForShop(shop, host) {
  const q = new URLSearchParams({ shop });
  if (host) q.set('host', host);
  return `/auth?${q.toString()}`;
}

function renderAuthorizeBreakout(res, shop, host) {
  const authPath = authUrlForShop(shop, host);
  const authFull = `${HOST}${authPath}`;
  // Do NOT load App Bridge here — it keeps OAuth inside Admin iframe and
  // accounts.shopify.com refuses to connect (X-Frame-Options).
  setEmbeddedCsp(res, shop);
  res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Autorizar ${escapeHtml(APP_TITLE)}</title>
  <style>
    :root { --accent:#008060; --bg:#f6f6f7; --text:#202223; --muted:#6d7175; }
    body { margin:0; font-family: Inter, "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--text); }
    .box { max-width: 28rem; margin: 3rem auto; padding: 1.5rem; background:#fff; border:1px solid #e1e3e5; border-radius:12px; text-align:center; }
    h1 { font-size:1.25rem; margin:0 0 0.5rem; }
    p { color:var(--muted); line-height:1.45; }
    .btn {
      display:inline-block; margin-top:1rem; padding:0.75rem 1.25rem; background:var(--accent); color:#fff;
      font-weight:700; text-decoration:none; border-radius:8px; font-size:1rem;
    }
    code { background:#f1f2f3; padding:0.1rem 0.35rem; border-radius:4px; font-size:0.85em; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Autorizar ${escapeHtml(APP_TITLE)}</h1>
    <p>Abriendo autorización fuera del Admin…</p>
    <p>Tienda: <code>${escapeHtml(shop)}</code></p>
    <a class="btn" id="auth-link" href="${escapeHtml(authFull)}" target="_top" rel="noopener">Instalar / Autorizar</a>
  </div>
  <script>
    (function () {
      var url = ${JSON.stringify(authFull)};
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
          return;
        }
      } catch (e) {}
      window.location.href = url;
    })();
  </script>
</body>
</html>`);
}

function sessionMissingScopes(session) {
  const granted = String((session && session.scope) || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const grantedSet = new Set(granted);
  return SCOPES.filter((required) => {
    if (grantedSet.has(required)) return false;
    if (required.startsWith('read_')) {
      const writeEquiv = `write_${required.slice('read_'.length)}`;
      if (grantedSet.has(writeEquiv)) return false;
    }
    return true;
  });
}

async function ensureAppReady(req, res, next) {
  const shopRaw = typeof req.query.shop === 'string' ? req.query.shop : '';
  const shop = shopify.api.utils.sanitizeShop(shopRaw);
  const hostRaw = typeof req.query.host === 'string' ? req.query.host : '';
  const host = hostRaw ? shopify.api.utils.sanitizeHost(hostRaw) : '';

  if (!shop) {
    res.status(400).send('No shop provided');
    return;
  }

  const forceReauth = req.query.reauth === '1';
  const session = forceReauth ? null : await loadOfflineSession(shop);
  if (session && forceReauth === false) {
    const missing = sessionMissingScopes(session);
    if (missing.length) {
      console.log(`[app] ${shop} missing scopes: ${missing.join(',')} — reauth`);
      try {
        const sessionId = shopify.api.session.getOfflineId(shop);
        await shopify.config.sessionStorage.deleteSession(sessionId);
      } catch (err) {
        console.warn('[app] delete session failed', err && err.message);
      }
      return renderAuthorizeBreakout(res, shop, host || hostRaw);
    }
  }

  if (!session) {
    console.log(`[app] no session for ${shop} — authorize breakout UI`);
    return renderAuthorizeBreakout(res, shop, host || hostRaw);
  }

  setEmbeddedCsp(res, shop);
  res.locals.shop = shop;
  res.locals.host = host || hostRaw;
  res.locals.session = session;
  return next();
}

function sendAppPage(req, res, extras = {}) {
  const shop = normalizeShop(req.query.shop || extras.shop || res.locals.shop || '');
  const host =
    typeof req.query.host === 'string' ? req.query.host : extras.host || res.locals.host || '';
  const tab = typeof req.query.tab === 'string' ? req.query.tab : extras.tab || 'inicio';

  setEmbeddedCsp(res, shop);
  res.status(200).type('html').send(
    renderAppPage({
      apiKey: API_KEY,
      shop,
      host,
      tab,
      appTitle: APP_TITLE,
      appSubtitle: APP_SUBTITLE,
    })
  );
}

async function requireShop(req, res, next) {
  const shopRaw =
    (typeof req.query.shop === 'string' && req.query.shop) ||
    (typeof req.headers['x-shopify-shop-domain'] === 'string' &&
      req.headers['x-shopify-shop-domain']) ||
    '';
  const shop = shopify.api.utils.sanitizeShop(shopRaw) || normalizeShop(shopRaw);
  if (!shop) {
    res.status(400).json({ error: { code: 'SHOP_REQUIRED', message: 'shop is required' } });
    return;
  }
  const session = await loadOfflineSession(shop);
  if (!session) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Shop not installed' } });
    return;
  }
  req.shop = shop;
  req.session = session;
  setEmbeddedCsp(res, shop);
  next();
}

bootstrap()
  .then(({ useCases, customersAdmin }) => {
    const app = express();
    // Apache terminates TLS and proxies HTTP → Node. Required for Secure OAuth cookies.
    app.set('trust proxy', 1);
    app.use(express.urlencoded({ extended: false }));

    app.get('/health', (_req, res) => {
      res.json({
        ok: true,
        app: 'syspricing',
        phase: 1,
        embedded: true,
        host: HOST,
        scopes: SCOPES,
        customerAuthMode: process.env.CUSTOMER_AUTH_MODE || 'oidc',
        timestamp: new Date().toISOString(),
      });
    });

    app.get(shopify.config.auth.path, (req, res, next) => {
      const embedded =
        req.query.embedded === '1' ||
        String(req.headers['sec-fetch-dest'] || '') === 'iframe';
      if (embedded) {
        const shop = typeof req.query.shop === 'string' ? req.query.shop : '';
        const host = typeof req.query.host === 'string' ? req.query.host : '';
        const q = new URLSearchParams({
          shop,
          host,
          redirectUri: `${HOST}${authUrlForShop(shop, host)}`,
        });
        return res.redirect(302, `/exitiframe?${q.toString()}`);
      }
      return shopify.auth.begin()(req, res, next);
    });
    app.get(
      shopify.config.auth.callbackPath,
      shopify.auth.callback(),
      async (_req, _res) => {
        console.log('[auth] OAuth ok');
      },
      shopify.redirectToShopifyOrAppRoot()
    );

    app.get('/exitiframe', (req, res) => {
      const shop = typeof req.query.shop === 'string' ? req.query.shop : '';
      const host = typeof req.query.host === 'string' ? req.query.host : '';
      let redirectUri =
        typeof req.query.redirectUri === 'string' && req.query.redirectUri
          ? req.query.redirectUri
          : authUrlForShop(shop, host);

      if (/^https?:\/\//i.test(redirectUri) && !redirectUri.startsWith(HOST)) {
        redirectUri = authUrlForShop(shop, host);
      }

      // Plain top-level breakout — no App Bridge (avoids accounts.shopify.com in iframe).
      setEmbeddedCsp(res, shopify.api.utils.sanitizeShop(shop) || shop);
      res.type('html').send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(APP_TITLE)} — autorizar</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; padding: 2rem; color: #202223; }
    a { color: #008060; font-weight: 600; }
  </style>
</head>
<body>
  <p>Se requiere autorización. Si no redirige automáticamente,
    <a id="cont" href="${escapeHtml(redirectUri)}" target="_top">continúa aquí</a>.
  </p>
  <script>
    (function () {
      var url = ${JSON.stringify(redirectUri)};
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
          return;
        }
      } catch (e) {}
      window.location.href = url;
    })();
  </script>
</body>
</html>`);
    });

    app.use(
      '/api/v1/customer',
      createCustomerApiRouter({ useCases, customersAdmin })
    );
    app.use(
      '/proxy',
      createProxyRouter({
        useCases,
        customersAdmin,
        apiSecret: process.env.SHOPIFY_API_SECRET,
      })
    );
    app.use(
      '/storefront',
      express.static(path.join(__dirname, 'presentation', 'storefront'), {
        maxAge: 0,
        setHeaders(res, filePath) {
          res.setHeader('Cache-Control', 'no-store');
          if (filePath.endsWith('.js')) res.type('application/javascript');
          if (filePath.endsWith('.css')) res.type('text/css');
        },
      })
    );
    app.use('/api/v1', createApiRouter({ useCases, requireShop, getAdminClient, ensureMetafieldDefinitions }));

    app.get(
      '/',
      async (req, res, next) => {
        const shop = typeof req.query.shop === 'string' ? req.query.shop : '';
        if (!shop) {
          return res
            .type('html')
            .send(renderInstallLanding({ host: HOST, scopes: SCOPES, appTitle: APP_TITLE }));
        }
        return ensureAppReady(req, res, next);
      },
      (req, res) => {
        sendAppPage(req, res);
      }
    );

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`${APP_TITLE} listening on :${PORT}`);
      console.log(`HOST=${HOST}`);
      console.log(`embedded=true phase=1`);
      console.log(`SCOPES=${SCOPES.join(',')}`);
      console.log(`customerAuthMode=${process.env.CUSTOMER_AUTH_MODE || 'oidc'}`);
      console.log(`auth callback=${HOST}/auth/callback`);
      console.log(`sessions=${SESSION_DB_PATH}`);
      console.log(`db=${path.join(DATA_DIR, 'syspricing.sqlite')}`);
    });
  })
  .catch((err) => {
    console.error('bootstrap failed', err);
    process.exit(1);
  });
