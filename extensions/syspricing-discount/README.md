# SYSPRICING Discount Function (tag-driven)

Customer **tags** = Price Lists. Applies absolute B2B prices in **cart / checkout**.

## Data

| Source | Shape |
|--------|--------|
| Variant `syspricing.prices` | `{ "distribuidor": "310.00" }` |
| Shop `syspricing.function-config` | `{ "tags": ["…"], "priority": { … } }` |
| Automatic discount metafield (same JSON) | Feeds Function input `$tags` |

## Behaviour

1. `hasTags(tags: $tags)` → customer tags that match active price lists.
   `$tags` includes case variants (`distribuidor` / `Distribuidor` / `DISTRIBUIDOR`) because Shopify `hasTags` is case-sensitive.
2. Sort by priority from config (case-insensitive).
3. First matching key in variant prices (case-insensitive) → fixed per-unit discount vs catalog (`appliesToEachItem`).

## Deploy (required once per Partner app)

```bash
cd extensions/syspricing-discount && npm install
cd ../..
shopify app deploy
```

Then in the embedded app: **Preparar tienda** (creates automatic discount `SYSPRICING B2B` + syncs config).

Re-open the app once so Shopify grants `read_discounts,write_discounts` if the install predates those scopes.
