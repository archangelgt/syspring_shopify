#!/usr/bin/env bash
# Bootstrap carpeta de deploy SomosFace en el servidor (ejecutar en el host).
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/erpsys-v1-docker/docker/syspricing_somosface}"
REPO_URL="${REPO_URL:-https://github.com/archangelgt/syspring_shopify.git}"
BRANCH="${BRANCH:-deploy/somosface}"

echo "==> Deploy dir: $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  sudo git clone -b "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
else
  sudo git -C "$DEPLOY_DIR" fetch origin
  sudo git -C "$DEPLOY_DIR" checkout "$BRANCH"
  sudo git -C "$DEPLOY_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$DEPLOY_DIR"
if [[ ! -f .env ]]; then
  sudo cp .env.example .env
  echo "Edita $DEPLOY_DIR/.env con SHOPIFY_API_KEY / SHOPIFY_API_SECRET de la app SomosFace."
fi

sudo docker compose up -d --build
curl -fsS "http://127.0.0.1:3012/health" | head -c 500
echo
echo "OK. Apache/TLS: ver deploy/somosface/README.md"
