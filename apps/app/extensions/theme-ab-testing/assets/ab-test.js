/**
 * AB Price Testing - Storefront Script
 *
 * This script runs on the Shopify storefront and handles:
 * - Visitor identification (persistent across sessions)
 * - Variant assignment via bucket API
 * - Price display modification
 * - Event tracking (views, add-to-cart)
 * - Cart attribute setting for checkout attribution
 */

(function() {
  'use strict';

  // Configuration from Liquid template
  const config = window.ABTestConfig || {};
  const API_URL = config.apiUrl || '';
  const SHOP_DOMAIN = config.shopDomain || '';

  // Constants
  const VISITOR_ID_KEY = 'ab_visitor_id';
  const ASSIGNMENT_CACHE_KEY = 'ab_assignment';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate a unique visitor ID
   */
  function generateVisitorId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'v_';
    for (let i = 0; i < 32; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Get or create visitor ID (persisted in localStorage + cookie)
   */
  function getVisitorId() {
    // Try localStorage first
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);

    // Try cookie as fallback
    if (!visitorId) {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === VISITOR_ID_KEY) {
          visitorId = value;
          break;
        }
      }
    }

    // Generate new if not found
    if (!visitorId) {
      visitorId = generateVisitorId();
    }

    // Persist to both localStorage and cookie
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
    document.cookie = `${VISITOR_ID_KEY}=${visitorId}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;

    return visitorId;
  }

  /**
   * Get cached assignment if valid
   */
  function getCachedAssignment(testId) {
    try {
      const cached = localStorage.getItem(`${ASSIGNMENT_CACHE_KEY}_${testId}`);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(`${ASSIGNMENT_CACHE_KEY}_${testId}`);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Cache assignment data
   */
  function cacheAssignment(testId, data) {
    try {
      localStorage.setItem(`${ASSIGNMENT_CACHE_KEY}_${testId}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch {
      // localStorage might be full or disabled
    }
  }

  /**
   * Fetch active test for this shop
   */
  async function fetchActiveTest() {
    if (!API_URL) return null;

    try {
      const response = await fetch(`${API_URL}/api/tests/active?shop=${encodeURIComponent(SHOP_DOMAIN)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[AB Test] Failed to fetch active test:', error);
      return null;
    }
  }

  /**
   * Get variant assignment from bucket API
   */
  async function getVariantAssignment(testId, productId) {
    const visitorId = getVisitorId();

    // Check cache first
    const cached = getCachedAssignment(testId);
    if (cached) {
      return cached;
    }

    // Fetch from API
    try {
      let url = `${API_URL}/api/bucket/${testId}?visitor_id=${encodeURIComponent(visitorId)}`;
      if (productId) {
        url += `&product_id=${encodeURIComponent(productId)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Bucket API returned ${response.status}`);
      }

      const data = await response.json();
      cacheAssignment(testId, data);
      return data;
    } catch (error) {
      console.error('[AB Test] Failed to get variant assignment:', error);
      return null;
    }
  }

  /**
   * Track an event
   */
  async function trackEvent(eventType, data = {}) {
    if (!API_URL || !window.ABTest?.variant) return;

    const visitorId = getVisitorId();
    const variant = window.ABTest.variant;

    try {
      await fetch(`${API_URL}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_id: variant.test_id || window.ABTest.testId,
          variant_id: variant.variant_id,
          visitor_id: visitorId,
          event_type: eventType,
          product_id: data.product_id || null,
          order_id: data.order_id || null,
          revenue_cents: data.revenue_cents || null
        })
      });
    } catch (error) {
      console.error('[AB Test] Failed to track event:', error);
    }
  }

  /**
   * Update price displays on the page
   */
  function updatePriceDisplays(priceModifierCents) {
    if (!priceModifierCents) return;

    // Common Shopify price selectors
    const priceSelectors = [
      '.price__regular .price-item--regular',
      '.price-item--regular',
      '.product__price',
      '.product-price',
      '[data-product-price]',
      '.money'
    ];

    for (const selector of priceSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Skip if already modified
        if (el.dataset.abModified === 'true') return;

        // Get original price
        let originalPrice = el.dataset.abOriginalPrice;
        if (!originalPrice) {
          // Parse price from text (remove currency symbol, convert to cents)
          const priceText = el.textContent.trim();
          const match = priceText.match(/[\d,.]+/);
          if (!match) return;

          originalPrice = Math.round(parseFloat(match[0].replace(/,/g, '')) * 100);
          el.dataset.abOriginalPrice = originalPrice;
        }

        // Calculate new price
        const newPrice = parseInt(originalPrice) + priceModifierCents;
        if (newPrice < 0) return;

        // Format and update
        const currency = window.Shopify?.currency?.active || 'USD';
        const formatted = formatMoney(newPrice, currency);
        el.textContent = formatted;
        el.dataset.abModified = 'true';
      });
    }
  }

  /**
   * Format money value
   */
  function formatMoney(cents, currency) {
    const amount = (cents / 100).toFixed(2);
    const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };
    const symbol = symbols[currency] || '$';
    return `${symbol}${amount}`;
  }

  /**
   * Set cart attributes for checkout attribution
   */
  async function setCartAttributes() {
    if (!window.ABTest?.variant) return;

    const visitorId = getVisitorId();
    const variant = window.ABTest.variant;

    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: {
            ab_test_id: window.ABTest.testId,
            ab_variant_id: variant.variant_id,
            ab_visitor_id: visitorId
          }
        })
      });
    } catch (error) {
      console.error('[AB Test] Failed to set cart attributes:', error);
    }
  }

  /**
   * Intercept add-to-cart events
   */
  function interceptAddToCart() {
    // Intercept fetch requests to /cart/add
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/cart/add')) {
        // Track add-to-cart event
        trackEvent('add_to_cart', {
          product_id: getProductIdFromPage()
        });

        // Set cart attributes after add
        setTimeout(setCartAttributes, 500);
      }

      return originalFetch.apply(this, arguments);
    };

    // Also intercept form submissions
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.action && form.action.includes('/cart/add')) {
        trackEvent('add_to_cart', {
          product_id: getProductIdFromPage()
        });
        setTimeout(setCartAttributes, 500);
      }
    });
  }

  /**
   * Get product ID from page context
   */
  function getProductIdFromPage() {
    // Try Shopify's product object
    if (window.ShopifyAnalytics?.meta?.product?.id) {
      return window.ShopifyAnalytics.meta.product.id.toString();
    }

    // Try meta tag
    const metaTag = document.querySelector('meta[property="og:product:id"]');
    if (metaTag) {
      return metaTag.content;
    }

    // Try from config
    if (config.productId) {
      return config.productId.toString();
    }

    return null;
  }

  /**
   * Initialize AB testing
   */
  async function init() {
    if (!API_URL) {
      console.warn('[AB Test] No API URL configured');
      return;
    }

    // Initialize global object
    window.ABTest = {
      apiUrl: API_URL,
      shopDomain: SHOP_DOMAIN,
      testId: null,
      variant: null,
      ready: false,
      getVisitorId,
      trackEvent
    };

    try {
      // Fetch active test for this shop
      const activeTest = await fetchActiveTest();
      if (!activeTest || !activeTest.id) {
        console.log('[AB Test] No active test for this shop');
        return;
      }

      window.ABTest.testId = activeTest.id;

      // Get variant assignment
      const productId = getProductIdFromPage();
      const variant = await getVariantAssignment(activeTest.id, productId);

      if (!variant) {
        console.log('[AB Test] No variant assignment received');
        return;
      }

      window.ABTest.variant = variant;
      window.ABTest.ready = true;

      // Update price displays if variant has price modifier
      if (variant.price_modifier_cents) {
        updatePriceDisplays(variant.price_modifier_cents);

        // Re-run on dynamic content changes
        const observer = new MutationObserver(() => {
          updatePriceDisplays(variant.price_modifier_cents);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      // Track view event
      trackEvent('view', { product_id: productId });

      // Set up add-to-cart interception
      interceptAddToCart();

      // Apply discount code to checkout if applicable
      if (variant.discount_code) {
        interceptCheckout(variant.discount_code);
      }

      console.log('[AB Test] Initialized:', {
        testId: activeTest.id,
        variant: variant.variant_name,
        priceModifier: variant.price_modifier_cents
      });

    } catch (error) {
      console.error('[AB Test] Initialization failed:', error);
    }
  }

  /**
   * Intercept checkout to apply discount code
   */
  function interceptCheckout(discountCode) {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href*="/checkout"]');
      if (link) {
        e.preventDefault();

        // Set cart attributes first
        setCartAttributes().then(() => {
          // Redirect with discount code
          const checkoutUrl = new URL(link.href);
          checkoutUrl.searchParams.set('discount', discountCode);
          window.location.href = checkoutUrl.toString();
        });
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
