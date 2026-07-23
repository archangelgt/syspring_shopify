# SYSPRICING Discount Function (tag-driven)

Customer **tags** = Price Lists.

## Data

| Source | Shape |
|--------|--------|
| Variant `syspricing.prices` | `{ "DPAÑUELOS": "335.00" }` |
| Shop `syspricing.function-config` | `{ "tags": ["…"], "priority": { "DPAÑUELOS": 10 } }` |
| Discount metafield (same JSON) | Wired as Function input variables `$tags` |

## Behaviour

1. `hasTags(tags: $tags)` → customer tags that match active price lists.
2. Sort by priority from config.
3. First matching key in variant prices → fixed discount vs catalog.

## Deploy

Copy shop `function-config` into the automatic discount metafield, then:

```bash
shopify app deploy
```
