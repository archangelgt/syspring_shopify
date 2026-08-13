import { cartLinesDiscountsGenerateRun } from './cart_lines_discounts_generate_run.js';

function input({ tags, prices, catalog, classes } = {}) {
  return {
    discount: {
      discountClasses: classes === undefined ? ['PRODUCT'] : classes,
      metafield: {
        value: JSON.stringify({
          tags: ['distribuidor'],
          priority: { distribuidor: 10 },
        }),
      },
    },
    cart: {
      buyerIdentity: {
        customer: {
          hasTags: (tags || ['distribuidor']).map((tag) => ({ tag, hasTag: true })),
        },
      },
      lines: [
        {
          id: 'gid://shopify/CartLine/1',
          cost: { amountPerQuantity: { amount: String(catalog ?? '499.00') } },
          merchandise: {
            __typename: 'ProductVariant',
            metafield: { value: JSON.stringify(prices || { distribuidor: '310.00' }) },
          },
        },
      ],
    },
  };
}

function amount(result) {
  return result.operations?.[0]?.productDiscountsAdd?.candidates?.[0]?.value?.fixedAmount?.amount;
}

const cases = [
  {
    name: 'applies B2B vs catalog',
    run: () => amount(cartLinesDiscountsGenerateRun(input())) === '189.00',
  },
  {
    name: 'matches Distribuidor tag against lowercase price key',
    run: () =>
      amount(
        cartLinesDiscountsGenerateRun(
          input({ tags: ['Distribuidor'], prices: { distribuidor: 310 } })
        )
      ) === '189.00',
  },
  {
    name: 'skips when no product class only shipping',
    run: () =>
      cartLinesDiscountsGenerateRun(input({ classes: ['SHIPPING'] })).operations.length === 0,
  },
  {
    name: 'applies when discountClasses missing',
    run: () => amount(cartLinesDiscountsGenerateRun(input({ classes: [] }))) === '189.00',
  },
  {
    name: 'no discount when B2B >= catalog',
    run: () =>
      cartLinesDiscountsGenerateRun(input({ prices: { distribuidor: '499.00' } })).operations
        .length === 0,
  },
];

let failed = 0;
for (const c of cases) {
  try {
    if (!c.run()) {
      failed += 1;
      console.error('FAIL', c.name);
    }
  } catch (err) {
    failed += 1;
    console.error('FAIL', c.name, err);
  }
}
if (failed) {
  process.exit(1);
}
console.log('discount function ok', cases.length);
