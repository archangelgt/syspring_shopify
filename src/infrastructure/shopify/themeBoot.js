'use strict';

const BOOT_MARKER = 'syspricing-cart-boot';
const BOOT_SNIPPET = `{%- comment -%} SYSPRICING storefront boot (all pages incl. /cart) {%- endcomment -%}
<div
  id="syspricing-cart-boot"
  hidden
  data-logged-in="{% if customer %}1{% else %}0{% endif %}"
  data-customer-id="{{ customer.id }}"
  data-customer-tags="{{ customer.tags | join: ',' | escape }}"
  data-proxy="/apps/syspricing/prices"
  data-currency="{{ cart.currency.iso_code | default: shop.currency }}"
></div>
{{ 'https://syspricing.shopify.somosface.erpsys.pro/storefront/syspricing-price.css?v=28' | stylesheet_tag }}
<script src="https://syspricing.shopify.somosface.erpsys.pro/storefront/syspricing-price.js?v=28" defer></script>
`;

/**
 * Inject SysPricing boot into layout/theme.liquid so /cart and every page load B2B JS.
 * Requires read_themes + write_themes.
 */
async function ensureThemeCartBoot(client) {
  if (!client) return { ok: false, reason: 'NO_CLIENT' };

  let themeId = null;
  try {
    const themes = await client.request(
      `#graphql
      query MainTheme {
        themes(first: 10, roles: [MAIN]) {
          nodes { id name role }
        }
      }`
    );
    themeId = themes.data?.themes?.nodes?.[0]?.id || null;
  } catch (err) {
    return { ok: false, reason: 'THEME_QUERY_FAILED', error: err.message };
  }
  if (!themeId) return { ok: false, reason: 'NO_MAIN_THEME' };

  let body = null;
  try {
    const file = await client.request(
      `#graphql
      query ThemeLiquid($themeId: ID!) {
        theme(id: $themeId) {
          id
          files(filenames: ["layout/theme.liquid"], first: 1) {
            nodes {
              body {
                ... on OnlineStoreThemeFileBodyText { content }
              }
            }
          }
        }
      }`,
      { variables: { themeId } }
    );
    body = file.data?.theme?.files?.nodes?.[0]?.body?.content || null;
  } catch (err) {
    return { ok: false, reason: 'THEME_READ_FAILED', error: err.message, hint: 'Reautoriza scopes read_themes,write_themes' };
  }
  if (!body) return { ok: false, reason: 'THEME_LIQUID_EMPTY' };

  if (body.includes(BOOT_MARKER) && body.includes('syspricing-price.js?v=28')) {
    return { ok: true, already: true, themeId };
  }

  let next = body;
  // Remove older boot blocks to avoid duplicates.
  next = next.replace(
    /\{%-?\s*comment\s*-?%\}[\s\S]*?SYSPRICING[\s\S]*?\{%-?\s*endcomment\s*-?%\}[\s\S]*?syspricing-price\.js[^<]*<\/script>\s*/gi,
    ''
  );
  next = next.replace(
    /<div[^>]*id="syspricing-cart-boot"[\s\S]*?<\/div>\s*\{\{[^}]*syspricing-price\.css[^}]*\}\}\s*<script[^>]*syspricing-price\.js[^>]*><\/script>\s*/gi,
    ''
  );

  if (/<\/body>/i.test(next)) {
    next = next.replace(/<\/body>/i, `${BOOT_SNIPPET}\n</body>`);
  } else {
    next += `\n${BOOT_SNIPPET}\n`;
  }

  try {
    const upsert = await client.request(
      `#graphql
      mutation UpsertThemeLiquid($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          themeId,
          files: [
            {
              filename: 'layout/theme.liquid',
              body: { type: 'TEXT', value: next },
            },
          ],
        },
      }
    );
    const errors = upsert.data?.themeFilesUpsert?.userErrors || [];
    if (errors.length) {
      return {
        ok: false,
        reason: 'THEME_UPSERT_FAILED',
        errors,
        hint: 'Reautoriza write_themes o pega el snippet cart-boot en theme.liquid',
      };
    }
    return { ok: true, updated: true, themeId };
  } catch (err) {
    return {
      ok: false,
      reason: 'THEME_UPSERT_FAILED',
      error: err.message,
      hint: 'Reautoriza scopes read_themes,write_themes',
    };
  }
}

function embedActivateUrl(shop, apiKey) {
  const handle = 'syspricing-embed';
  const store = String(shop || '')
    .replace(/\.myshopify\.com$/i, '')
    .replace(/^https?:\/\//, '');
  const key = apiKey || process.env.SHOPIFY_API_KEY || '';
  return `https://admin.shopify.com/store/${store}/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(`${key}/${handle}`)}`;
}

module.exports = { ensureThemeCartBoot, embedActivateUrl, BOOT_SNIPPET };
