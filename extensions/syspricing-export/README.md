# SYSPRICING Export (Admin selection action)

Appears under **Products → … → Apps** when one or more products are selected (same place as WPD export).

Exports `sku,variant_id,tag,price` from variant metafield `syspricing.prices`.

## Deploy

Requires Shopify CLI against the SomosFace Partner app:

```bash
# from repo root (deploy/somosface)
shopify app deploy --force
```

Ensure Partner app URLs point to `https://syspricing.shopify.somosface.erpsys.pro`.
