# Shopify Theme Integration

This folder contains the files needed to integrate A/B testing into your Shopify store.

## Installation

### 1. Add the Snippet

Copy `snippets/ab-test.liquid` to your theme's `snippets/` folder.

### 2. Add the JavaScript

Copy `assets/ab-test.js` to your theme's `assets/` folder.

### 3. Include in Theme

Add the following line to your `theme.liquid` file, just before `</head>`:

```liquid
{% render 'ab-test' %}
```

### 4. Configure API URL

Edit `snippets/ab-test.liquid` and update the API URL:

```liquid
{%- assign ab_api_url = 'https://your-ab-testing-app.com' -%}
```

### 5. Set Active Test (via Metafields)

Create a shop metafield to store the active test ID:

- Namespace: `ab_testing`
- Key: `active_test_id`
- Type: `single_line_text_field`

You can set this via the Shopify Admin API or using an app like "Metafields Guru".

## How It Works

1. **Visitor Bucketing**: When a visitor lands on your store, the script assigns them to a test variant and persists this assignment.

2. **Price Display**: If the variant has a price modifier, the script updates price displays on the page.

3. **Checkout**: When the visitor checks out, the script:
   - Adds A/B test attribution as cart note attributes
   - Auto-applies the variant's discount code (if any)

4. **Event Tracking**: The script automatically tracks:
   - Page views
   - Add to cart events
   - (Purchases are tracked via Shopify webhooks)

## Price Display Integration

For automatic price updates, add the `ab-price` class to your price elements:

```html
<span class="ab-price" data-original-price="{{ product.price }}">
  {{ product.price | money }}
</span>
```

Or use the data attribute:

```html
<span data-ab-price data-original-price="{{ product.price }}">
  {{ product.price | money }}
</span>
```

## JavaScript API

The script exposes a global `ABTest` object:

```javascript
// Wait for A/B test to initialize
ABTest.onReady(function(variant) {
  console.log('Assigned to:', variant.variant_name);
  console.log('Discount code:', variant.discount_code);
  console.log('Price modifier:', variant.price_modifier_cents);
});

// Get current variant
var variant = ABTest.getVariant();

// Get visitor ID
var visitorId = ABTest.getVisitorId();

// Manually track an event
ABTest.trackEvent('custom_event', { productId: '123' });
```

## Webhook Setup

To track purchases, set up a Shopify webhook:

1. Go to Settings > Notifications > Webhooks
2. Create a webhook for `orders/paid`
3. Set the URL to: `https://your-ab-testing-app.com/api/webhooks/shopify`
4. Note the webhook secret and add it to your app's environment variables

## Troubleshooting

**Prices not updating?**
- Ensure price elements have the correct class or data attribute
- Check browser console for errors
- Verify the API URL is correct and accessible

**Discount not applying?**
- Verify the discount code exists in Shopify
- Check that the discount is active and valid
- Ensure cookies are enabled in the browser

**Events not tracking?**
- Check browser console for API errors
- Verify the test is in "active" status
- Check network tab for `/api/track` requests
