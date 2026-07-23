/**
 * Hosted storefront helper (same logic as theme asset).
 * Merchant can add to theme.liquid when Customer is logged in:
 *
 * {% if customer %}
 *   <div id="syspricing-b2b-price" data-logged-in="1"
 *        data-variant-id="{{ product.selected_or_first_available_variant.id }}"
 *        data-proxy="/apps/syspricing/prices">
 *     <span class="syspricing-label">Tu precio:</span>
 *     <span class="syspricing-amount"></span>
 *     <span class="syspricing-tag"></span>
 *   </div>
 *   <script src="https://syspricing.shopify.erpsys.pro/storefront/syspricing-price.js" defer></script>
 * {% endif %}
 */
