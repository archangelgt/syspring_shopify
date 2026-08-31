'use strict';

const SCRIPT_SRC =
  'https://syspricing.shopify.somosface.erpsys.pro/storefront/syspricing-price.js?v=28';

/**
 * Ensure a storefront ScriptTag loads SysPricing on every page (incl. /cart).
 * Requires write_script_tags.
 */
async function ensureStorefrontScriptTag(client) {
  if (!client) return { ok: false, reason: 'NO_CLIENT' };

  let existing = [];
  try {
    const res = await client.request(
      `#graphql
      query ScriptTags {
        scriptTags(first: 50) {
          nodes { id src displayScope }
        }
      }`
    );
    existing = res.data?.scriptTags?.nodes || [];
  } catch (err) {
    return {
      ok: false,
      reason: 'SCRIPT_TAG_LIST_FAILED',
      error: err.message,
      hint: 'Reautoriza read_script_tags,write_script_tags',
    };
  }

  const hit = existing.find((t) => /syspricing-price\.js/i.test(String(t.src || '')));
  if (hit && String(hit.src) === SCRIPT_SRC) {
    return { ok: true, already: true, id: hit.id, src: hit.src };
  }

  if (hit?.id) {
    try {
      const upd = await client.request(
        `#graphql
        mutation ScriptTagUpdate($id: ID!, $input: ScriptTagInput!) {
          scriptTagUpdate(id: $id, input: $input) {
            scriptTag { id src }
            userErrors { field message }
          }
        }`,
        { variables: { id: hit.id, input: { src: SCRIPT_SRC, displayScope: 'ONLINE_STORE' } } }
      );
      const errors = upd.data?.scriptTagUpdate?.userErrors || [];
      if (!errors.length && upd.data?.scriptTagUpdate?.scriptTag?.id) {
        return {
          ok: true,
          updated: true,
          id: upd.data.scriptTagUpdate.scriptTag.id,
          src: SCRIPT_SRC,
        };
      }
    } catch (_) {
      /* fall through to create */
    }
  }

  try {
    const created = await client.request(
      `#graphql
      mutation ScriptTagCreate($input: ScriptTagInput!) {
        scriptTagCreate(input: $input) {
          scriptTag { id src }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            src: SCRIPT_SRC,
            displayScope: 'ONLINE_STORE',
          },
        },
      }
    );
    const payload = created.data?.scriptTagCreate;
    const errors = payload?.userErrors || [];
    if (!errors.length && payload?.scriptTag?.id) {
      return { ok: true, created: true, id: payload.scriptTag.id, src: payload.scriptTag.src };
    }
    return {
      ok: false,
      reason: 'SCRIPT_TAG_CREATE_FAILED',
      errors,
      hint: errors.map((e) => e.message).join('; ') || 'Reautoriza write_script_tags',
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'SCRIPT_TAG_CREATE_FAILED',
      error: err.message,
      hint: 'Reautoriza write_script_tags o activa el App embed SYSPRICING cart B2B',
    };
  }
}

module.exports = { ensureStorefrontScriptTag, SCRIPT_SRC };
