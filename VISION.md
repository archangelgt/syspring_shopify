# SYSPRICING — Vision

SYSPRICING is the foundation of a complete **B2B Commerce Platform** for Shopify.

Phase 1 replaces traditional wholesale pricing apps (e.g. WSH) with a **tag-driven Price List** engine: **Shopify customer tags ARE the price lists**.

**Pricing is only the first module.**

## Strategic Position

- **Shopify** owns authentication, products, inventory, orders, checkout, and **customer tags**.
- **B2B customer login** uses **Shopify Customer Accounts** (OAuth 2.0 + OIDC + Customer Account API) — same model as Rey Caps (`account.<brand>.com`, scope `openid email customer-account-api:full`).
- **SYSPRICING** owns B2B absolute variant prices per tag, matrix admin UI, metafield projection, and APIs. It never owns customer passwords or OIDC.

```
SYSPRICING = Price Engine
SYSPRICING = B2B Platform

├── Pricing (tag = Price List)
├── Catalogs
├── Visibility
├── Mobile
├── Portal
├── Promotions
├── Customers
├── Analytics
├── APIs
└── Future Modules
```

## Product Roadmap

### Phase 1 — SYSPRICING (current)

- Price Lists keyed by **customer tag** (e.g. `DPAÑUELOS`)
- Variant-level fixed pricing (matrix UI)
- Shopify Functions (checkout)
- CSV Import
- Activity Logs
- Customer Accounts OIDC scaffold (portal/mobile)

### Phase 2 — Exclusive Catalogs

- Product visibility by customer tag / price list
- Hidden products / collections
- Exclusive brands / categories
- Draft catalog support

### Phase 3 — B2B Customer Portal

Responsive web portal. Auth: Customer Accounts OIDC. Prices resolved from customer tags.

### Phase 4 — Flutter Mobile Application

Presentation-only client. Same Customer Accounts identity + SYSPRICING API. No pricing logic in Flutter.

## Customer Experience

A **customer tag** selects the Price List. Multiple tags → priority order (see Architecture).

Future permissions may still hang off the same tag axis (visibility, promotions, payment/shipping limits).

## Design Principles

- Shopify-native
- API-first / mobile-first
- **Tag-driven Price Lists**
- Variant-level absolute pricing
- Clean Architecture
- Stateless services
- SaaS-ready
