# SysPricing

**SYSPRICING** — B2B Price Engine for Shopify. **Customer tag = Price List** (WSH model).

See [VISION.md](./VISION.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Phase 1

- Price Lists keyed by Shopify customer tag (`DPAÑUELOS`, …)
- Variant Pricing matrix (fixed + % vs base)
- CSV Import (`sku,variant_id,tag,price`)
- Activity Logs
- Metafield sync + Discount Function stub
- Customer Accounts OIDC scaffold (`/api/v1/customer`)

---

## Stack

| Pieza | Detalle |
|-------|---------|
| Host | `https://syspricing.shopify.somosface.erpsys.pro` |
| Puerto | **3012** → `:3000` |
| Contenedor | `erpsys-syspricing-somosface` |
| Rama / carpeta | `deploy/somosface` → `/var/www/erpsys-v1-docker/docker/syspricing_somosface` |
| DB | sql.js → `DATA_DIR/syspricing.sqlite` |
| Health | `GET /health` |

> Instancia **SomosFace**. La de Seraph (`main`, puerto 3011) no puede instalarse aquí por Custom distribution Plus. Ver [deploy/somosface/README.md](./deploy/somosface/README.md).

```bash
docker compose up -d --build
curl http://127.0.0.1:3012/health
npm install && npm run test:smoke
```

---

## API merchant

| Método | Ruta |
|--------|------|
| CRUD | `/api/v1/price-lists` (`tag` required) |
| GET/PUT | `/api/v1/price-lists/:id/prices` |
| PUT | `/api/v1/prices/matrix` |
| GET | `/api/v1/products?q=` |
| POST | `/api/v1/import/csv` |
| POST | `/api/v1/export/csv` (`productIds` o `all: true`) |
| GET | `/api/v1/customers?q=` |
| GET | `/api/v1/resolve?tags=DPAÑUELOS,MPAÑUELOS&variantId=` |
| GET | `/api/v1/activity` |

## API customer

| Método | Ruta |
|--------|------|
| GET | `/api/v1/customer/me` |
| GET | `/api/v1/customer/prices?variantIds=` |

Auth: Bearer OIDC (Phase 3) o `CUSTOMER_AUTH_MODE=dev`.

---

## Storefront (precio B2B en el PDP)

Shopify **no** cambia el precio de la ficha de producto con Functions (solo cart/checkout).

1. **App Proxy** (Partner Dashboard o `shopify.app.toml`):
   - Prefix `apps` / subpath `syspricing`
   - URL `https://syspricing.shopify.somosface.erpsys.pro/proxy`
2. Crea Price Lists = tags (`DPAÑUELOS`, …) y carga precios en **Variant Pricing**.
3. En el theme, añade el App Block **SYSPRICING B2B Price**, o el snippet Liquid (ver tab Inicio en la app).
4. El JS llama `/apps/syspricing/prices?variant_ids=…` con el customer logueado y reemplaza el precio.

Assets públicos: `/storefront/syspricing-price.js` y `.css`.
