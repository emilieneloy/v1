/**
 * A/B Testing Client Script for Shopify
 *
 * This script handles:
 * - Visitor ID generation and persistence
 * - Variant assignment via API
 * - Price display modification
 * - Event tracking (views, add to cart, purchases)
 * - Auto-applying discount codes at checkout
 */

(function() {
  'use strict';

  // Configuration from window.ABTest (set by Liquid snippet)
  var config = window.ABTest || {};

  if (!config.apiUrl || !config.testId) {
    console.warn('[AB Test] Missing configuration');
    return;
  }

  // ============================================
  // Visitor ID Management
  // ============================================

  function generateVisitorId() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var id = '';
    for (var i = 0; i < 32; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'v_' + id;
  }

  function getVisitorId() {
    var key = 'ab_visitor_id';

    // Try localStorage first
    var visitorId = localStorage.getItem(key);
    if (visitorId) return visitorId;

    // Try cookie
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf(key + '=') === 0) {
        visitorId = cookie.substring(key.length + 1);
        // Sync to localStorage
        localStorage.setItem(key, visitorId);
        return visitorId;
      }
    }

    // Generate new ID
    visitorId = generateVisitorId();
    localStorage.setItem(key, visitorId);

    // Set cookie (30 days)
    var expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
    document.cookie = key + '=' + visitorId + ';expires=' + expires.toUTCString() + ';path=/';

    return visitorId;
  }

  // ============================================
  // API Communication
  // ============================================

  function fetchVariant(callback) {
    var visitorId = getVisitorId();
    var url = config.apiUrl + '/api/bucket/' + config.testId +
              '?visitor_id=' + encodeURIComponent(visitorId);

    if (config.productId) {
      url += '&product_id=' + encodeURIComponent(config.productId);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var response = JSON.parse(xhr.responseText);
            callback(null, response);
          } catch (e) {
            callback(e, null);
          }
        } else {
          callback(new Error('API request failed: ' + xhr.status), null);
        }
      }
    };
    xhr.send();
  }

  function trackEvent(eventType, data) {
    var visitorId = getVisitorId();
    var payload = {
      test_id: config.testId,
      variant_id: config.variant ? config.variant.variant_id : null,
      visitor_id: visitorId,
      event_type: eventType,
      product_id: data.productId || config.productId || null,
      order_id: data.orderId || null,
      revenue_cents: data.revenueCents || null
    };

    // Don't track if we don't have a variant assigned
    if (!payload.variant_id) return;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.apiUrl + '/api/track', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(payload));
  }

  // ============================================
  // Price Display Modification
  // ============================================

  function formatMoney(cents) {
    var amount = (cents / 100).toFixed(2);
    var currency = config.currency || 'USD';

    // Simple currency formatting
    var symbols = {
      'USD': '$',
      'EUR': '\u20AC',
      'GBP': '\u00A3',
      'CAD': 'CA$',
      'AUD': 'A$'
    };

    var symbol = symbols[currency] || '$';
    return symbol + amount;
  }

  function updatePriceDisplays() {
    if (!config.variant || !config.variant.price_modifier_cents) return;

    var modifier = config.variant.price_modifier_cents;
    var priceElements = document.querySelectorAll('.ab-price, [data-ab-price], .price__regular, .price-item--regular');

    priceElements.forEach(function(el) {
      var originalPrice = el.getAttribute('data-original-price') ||
                          el.getAttribute('data-price') ||
                          parseFloat(el.textContent.replace(/[^0-9.-]+/g, ''));

      if (originalPrice) {
        var originalCents = typeof originalPrice === 'string' ?
                           Math.round(parseFloat(originalPrice) * 100) :
                           originalPrice;
        var newCents = Math.max(0, originalCents + modifier);
        el.textContent = formatMoney(newCents);
        el.setAttribute('data-ab-modified', 'true');
      }
    });
  }

  // ============================================
  // Checkout Integration
  // ============================================

  function setupCheckoutRedirect() {
    if (!config.variant || !config.variant.discount_code) return;

    var discountCode = config.variant.discount_code;

    // Intercept checkout links
    document.addEventListener('click', function(e) {
      var target = e.target.closest('a[href*="/checkout"], button[name="checkout"], input[name="checkout"]');

      if (target) {
        e.preventDefault();

        // Add note attributes for attribution
        addCartAttributes(function() {
          // Redirect to checkout with discount
          var checkoutUrl = '/checkout?discount=' + encodeURIComponent(discountCode);
          window.location.href = checkoutUrl;
        });
      }
    });

    // Also handle form submissions
    document.addEventListener('submit', function(e) {
      if (e.target.action && e.target.action.indexOf('/cart') > -1) {
        addCartAttributes();
      }
    });
  }

  function addCartAttributes(callback) {
    // Add A/B test info as cart note attributes for webhook attribution
    var attributes = {
      'ab_test_id': config.testId,
      'ab_variant_id': config.variant.variant_id,
      'ab_visitor_id': getVisitorId()
    };

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/cart/update.js', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && callback) {
        callback();
      }
    };
    xhr.send(JSON.stringify({ attributes: attributes }));
  }

  // ============================================
  // Event Tracking Hooks
  // ============================================

  function setupEventTracking() {
    // Track page view
    trackEvent('view', {});

    // Track add to cart
    var originalFetch = window.fetch;
    window.fetch = function(url, options) {
      var result = originalFetch.apply(this, arguments);

      if (url && url.indexOf('/cart/add') > -1) {
        result.then(function() {
          trackEvent('add_to_cart', {});
        });
      }

      return result;
    };

    // Track via XHR as well (for older themes)
    var originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalXhrOpen.apply(this, arguments);
    };

    var originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      if (this._url && this._url.indexOf('/cart/add') > -1) {
        this.addEventListener('load', function() {
          trackEvent('add_to_cart', {});
        });
      }
      return originalXhrSend.apply(this, arguments);
    };

    // Track checkout start (for revenue attribution via webhooks)
    // The actual purchase tracking is done via Shopify webhooks
  }

  // ============================================
  // Storage for variant assignment
  // ============================================

  function getCachedVariant() {
    var key = 'ab_variant_' + config.testId;
    var cached = localStorage.getItem(key);

    if (cached) {
      try {
        var data = JSON.parse(cached);
        // Check if cache is still valid (24 hours)
        if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data.variant;
        }
      } catch (e) {
        // Invalid cache
      }
    }
    return null;
  }

  function cacheVariant(variant) {
    var key = 'ab_variant_' + config.testId;
    localStorage.setItem(key, JSON.stringify({
      variant: variant,
      timestamp: Date.now()
    }));
  }

  // ============================================
  // Initialization
  // ============================================

  function init() {
    // Check for cached variant first
    var cached = getCachedVariant();

    if (cached) {
      config.variant = cached;
      config.ready = true;
      onReady();
      return;
    }

    // Fetch variant from API
    fetchVariant(function(err, variant) {
      if (err) {
        console.error('[AB Test] Failed to get variant:', err);
        return;
      }

      config.variant = variant;
      config.ready = true;
      cacheVariant(variant);
      onReady();
    });
  }

  function onReady() {
    // Update price displays
    updatePriceDisplays();

    // Setup checkout integration
    setupCheckoutRedirect();

    // Setup event tracking
    setupEventTracking();

    // Run any registered callbacks
    config.callbacks.forEach(function(cb) {
      cb(config.variant);
    });
  }

  // Public API
  window.ABTest.init = init;

  window.ABTest.onReady = function(callback) {
    if (config.ready) {
      callback(config.variant);
    } else {
      config.callbacks.push(callback);
    }
  };

  window.ABTest.getVariant = function() {
    return config.variant;
  };

  window.ABTest.getVisitorId = getVisitorId;

  window.ABTest.trackEvent = trackEvent;

})();
