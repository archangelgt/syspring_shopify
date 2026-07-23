# SYSPRICING — Architecture (Phase 1)

## Goals

Tag-driven B2B Price Engine (WSH model): **Shopify customer tag = Price List**. API-first, ready for Portal/Mobile without rewriting domain logic.

## High-Level Context

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Shopify Admin   │────▶│ SYSPRICING App   │────▶│ SQLite (tenant DB) │
│ tags on Customer│     │ Express API      │     │ price_lists.tag…   │
└─────────────────┘     └────────┬─────────┘     └────────────────────┘
                                 │
                    metafield sync (variant prices by tag)
                                 │
                                 ▼
┌─────────────────┐     ┌──────────────────┐
│ Customer / Cart │────▶│ Shopify Function │  reads customer.tags
│ Checkout        │     │ (Discount)       │  + variant.prices JSON
└─────────────────┘     └──────────────────┘
```

**Invariant:** Functions cannot call SYSPRICING. Prices are projected to variant metafield `syspricing.prices` keyed by **tag string**.

## Customer Authentication (Rey Caps)

| Audience | Auth | Used by |
|----------|------|---------|
| Merchant | App OAuth offline | Admin UI, sync |
| B2B Customer | Customer Accounts OIDC (`customer-account-api:full`) | Portal / Flutter / storefront |

SYSPRICING never stores passwords. Assignment to a price list = **putting the tag on the customer in Shopify**.

## Domain Model

### PriceList

| Field | Notes |
|-------|--------|
| id | UUID |
| shop | Tenant |
| tag | Unique per shop — **equals Shopify customer tag** (`DPAÑUELOS`) |
| name | Display label (defaults to tag) |
| currency | Default `GTQ` |
| status | `draft` \| `active` \| `archived` |
| priority | Higher wins when customer has multiple matching tags |

### VariantPrice

Absolute fixed price for a Shopify variant on one Price List (tag).

### ActivityLog

Append-only audit.

## Price Resolution (multi-tag)

Customer example tags: `DPAÑUELOS`, `MPAÑUELOS`.

1. Intersect customer tags with **active** price lists.
2. Sort by `priority` DESC.
3. First list that has a variant price wins.
4. Else → Shopify catalog price.

## Metafield Contract

| Owner | Namespace / key | Value |
|-------|-----------------|--------|
| ProductVariant | `syspricing.prices` | `{ "DPAÑUELOS": "335.00", "MPAÑUELOS": "360.00" }` |

## REST API (v1)

### Merchant (`?shop=` + offline session)

| Method | Path |
|--------|------|
| CRUD | `/price-lists` (`tag` required) |
| GET/PUT | `/price-lists/:id/prices` |
| PUT | `/prices/matrix` |
| GET | `/products?q=` |
| POST | `/import/csv` (`sku,variant_id,tag,price`) |
| GET | `/customers?q=` (read-only tags → matched lists) |
| GET | `/resolve?tags=&variantId=` or `?customerId=&variantId=` |
| GET | `/activity` |

### Customer (`/api/v1/customer`)

OIDC Bearer (Phase 3) or `CUSTOMER_AUTH_MODE=dev`. Resolves via customer **tags**.

## UI Tabs

Inicio · Price Lists · Variant Pricing (matrix) · CSV · Clientes (read-only) · Activity

## Persistence

SQLite via **sql.js** at `DATA_DIR/syspricing.sqlite`. Schema reset on open drops legacy `customer_segments` tables.

## Clean Architecture

```
src/domain/  src/application/  src/infrastructure/  src/interfaces/  src/presentation/
```

## Storefront display

Functions do **not** change Online Store PDP prices. Use:

1. **App Proxy** `/apps/syspricing/prices` → `/proxy/prices` (resolves from DB by customer tags).
2. Theme App Extension / Liquid snippet + `syspricing-price.js` to replace catalog price when logged in.

Metafield `syspricing.prices` on variants is for Functions + optional Liquid; definitions created with storefront `PUBLIC_READ` on sync.
