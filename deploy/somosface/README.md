# Deploy SysPricing — SomosFace

Instancia aislada para `somosface.myshopify.com`.

| Pieza | Valor |
|-------|--------|
| Host | `https://syspricing.shopify.somosface.erpsys.pro` |
| Puerto host | **3012** → contenedor `:3000` |
| Contenedor | `erpsys-syspricing-somosface` |
| Carpeta servidor | `/var/www/erpsys-v1-docker/docker/syspricing_somosface` |
| Rama | `deploy/somosface` |

La app Shopify original está en Custom distribution anclada a `seraph-systems.myshopify.com` (Plus org). SomosFace necesita **otra app** en Partners con Custom distribution → `somosface.myshopify.com`.

## 1. Partner Dashboard (obligatorio)

1. Crear app **syspricing-somosface** (o similar).
2. App URL: `https://syspricing.shopify.somosface.erpsys.pro`
3. Redirect: `https://syspricing.shopify.somosface.erpsys.pro/auth/callback`
4. App proxy: prefix `apps` / subpath `syspricing` → `https://syspricing.shopify.somosface.erpsys.pro/proxy`
5. Distribution: **Custom** → `somosface.myshopify.com` → Generate link.
6. Copiar Client ID + Secret a `.env` en el servidor.
7. Actualizar `client_id` en `shopify.app.toml`.

## 2. DNS

```
syspricing.shopify.somosface.erpsys.pro  →  mismo IP que syspricing.shopify.erpsys.pro
```

## 3. Carpeta en el servidor

```bash
# En erpsys.pro, junto a docker/syspricing (puerto 3011):
cd /var/www/erpsys-v1-docker/docker/syspricing_somosface
# rama deploy/somosface ya clonada
# editar .env: SHOPIFY_API_KEY / SHOPIFY_API_SECRET (app Partners NUEVA)
docker compose up -d --build
curl -sS http://127.0.0.1:3012/health
```

## 4. Apache + TLS

```bash
sudo cp apache/syspricing.shopify.somosface.erpsys.pro.conf \
  /etc/httpd/conf.d/   # o sites-available según el host
sudo cp apache/syspricing.shopify.somosface.erpsys.pro-le-ssl.conf \
  /etc/httpd/conf.d/

# Certificado (después de DNS):
sudo certbot --apache -d syspricing.shopify.somosface.erpsys.pro

sudo apachectl configtest && sudo systemctl reload httpd
# o: sudo systemctl reload apache2
```

## 5. Smoke

```bash
curl -sS https://syspricing.shopify.somosface.erpsys.pro/health
# Instalar con el install link de Custom distribution (no el OAuth genérico de la app Seraph).
```

## No mezclar

| Instancia | Puerto | Contenedor | Volumen |
|-----------|--------|------------|---------|
| Seraph (`main`) | 3011 | `erpsys-syspricing-app` | `syspricing-data` |
| SomosFace (`deploy/somosface`) | 3012 | `erpsys-syspricing-somosface` | `syspricing-somosface-data` |
