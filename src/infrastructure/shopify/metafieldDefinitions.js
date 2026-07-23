'use strict';

/**
 * Ensure metafield definitions exist (storefront-readable for headless; Liquid always can read).
 */
async function ensureMetafieldDefinitions(client) {
  if (!client) return { ok: false };

  const defs = [
    {
      name: 'SYSPRICING Tag Prices',
      namespace: 'syspricing',
      key: 'prices',
      description: 'JSON map of customer-tag → absolute B2B price',
      type: 'json',
      ownerType: 'PRODUCTVARIANT',
      access: { storefront: 'PUBLIC_READ' },
    },
    {
      name: 'SYSPRICING Function Config',
      namespace: 'syspricing',
      key: 'function-config',
      description: 'Active tags + priority for Discount Function / theme',
      type: 'json',
      ownerType: 'SHOP',
      access: { storefront: 'PUBLIC_READ' },
    },
  ];

  const results = [];
  for (const definition of defs) {
    const created = await client.request(
      `#graphql
      mutation EnsureDef($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id namespace key }
          userErrors { field message code }
        }
      }`,
      { variables: { definition } }
    );
    const errors = created.data?.metafieldDefinitionCreate?.userErrors || [];
    const taken = errors.some(
      (e) =>
        String(e.code || '').includes('TAKEN') ||
        String(e.message || '').toLowerCase().includes('taken')
    );
    if (errors.length && !taken) {
      results.push({ key: definition.key, ok: false, errors });
      continue;
    }
    results.push({
      key: definition.key,
      ok: true,
      id: created.data?.metafieldDefinitionCreate?.createdDefinition?.id || 'exists',
    });
  }
  return { ok: true, results };
}

module.exports = { ensureMetafieldDefinitions };
