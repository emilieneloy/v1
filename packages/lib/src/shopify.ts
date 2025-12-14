/**
 * Shopify Admin API Client
 *
 * Handles discount code creation and management for A/B testing
 */

export interface ShopifyConfig {
  store: string; // mystore.myshopify.com
  accessToken: string; // Admin API access token
  apiVersion?: string;
}

export interface DiscountCodeInput {
  code: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  value: {
    type: "percentage" | "fixed_amount";
    value: number; // percentage (0-100) or amount in currency units
  };
  productIds?: string[]; // Specific products (leave empty for all)
  minimumRequirement?: {
    type: "subtotal" | "quantity";
    value: number;
  };
}

export interface DiscountCode {
  id: string;
  code: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  variants: {
    id: string;
    title: string;
    price: string;
    compare_at_price: string | null;
  }[];
  images: {
    src: string;
  }[];
}

export class ShopifyClient {
  private store: string;
  private accessToken: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(config: ShopifyConfig) {
    this.store = config.store.replace(".myshopify.com", "");
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || "2024-01";
    this.baseUrl = `https://${this.store}.myshopify.com/admin/api/${this.apiVersion}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const url = `https://${this.store}.myshopify.com/admin/api/${this.apiVersion}/graphql.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify GraphQL error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Create a discount code for A/B testing
   */
  async createDiscountCode(input: DiscountCodeInput): Promise<DiscountCode> {
    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
                status
                startsAt
                endsAt
                usageLimit
                asyncUsageCount
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const customerGets =
      input.value.type === "percentage"
        ? {
            value: {
              percentage: input.value.value / 100, // Convert to decimal
            },
            items: input.productIds?.length
              ? {
                  products: {
                    productsToAdd: input.productIds.map(
                      (id) => `gid://shopify/Product/${id}`
                    ),
                  },
                }
              : { all: true },
          }
        : {
            value: {
              discountAmount: {
                amount: input.value.value,
                appliesOnEachItem: false,
              },
            },
            items: input.productIds?.length
              ? {
                  products: {
                    productsToAdd: input.productIds.map(
                      (id) => `gid://shopify/Product/${id}`
                    ),
                  },
                }
              : { all: true },
          };

    const variables = {
      basicCodeDiscount: {
        title: input.title || input.code,
        code: input.code,
        startsAt: input.startsAt || new Date().toISOString(),
        endsAt: input.endsAt || null,
        usageLimit: input.usageLimit || null,
        appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
        customerGets,
        minimumRequirement: input.minimumRequirement
          ? input.minimumRequirement.type === "subtotal"
            ? { subtotal: { greaterThanOrEqualToSubtotal: input.minimumRequirement.value } }
            : { quantity: { greaterThanOrEqualToQuantity: input.minimumRequirement.value } }
          : null,
        customerSelection: { all: true },
      },
    };

    const result = await this.graphql<{
      discountCodeBasicCreate: {
        codeDiscountNode: {
          id: string;
          codeDiscount: {
            title: string;
            codes: { nodes: { code: string }[] };
            status: string;
            startsAt: string;
            endsAt: string | null;
            usageLimit: number | null;
            asyncUsageCount: number;
          };
        };
        userErrors: { field: string; message: string }[];
      };
    }>(mutation, variables);

    if (result.discountCodeBasicCreate.userErrors.length > 0) {
      throw new Error(
        `Failed to create discount: ${result.discountCodeBasicCreate.userErrors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    const discount = result.discountCodeBasicCreate.codeDiscountNode;
    return {
      id: discount.id,
      code: discount.codeDiscount.codes.nodes[0].code,
      title: discount.codeDiscount.title,
      status: discount.codeDiscount.status,
      startsAt: discount.codeDiscount.startsAt,
      endsAt: discount.codeDiscount.endsAt,
      usageLimit: discount.codeDiscount.usageLimit,
      usageCount: discount.codeDiscount.asyncUsageCount,
    };
  }

  /**
   * Get discount code by code string
   */
  async getDiscountCode(code: string): Promise<DiscountCode | null> {
    const query = `
      query getDiscountByCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) {
                nodes {
                  code
                }
              }
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
            }
          }
        }
      }
    `;

    const result = await this.graphql<{
      codeDiscountNodeByCode: {
        id: string;
        codeDiscount: {
          title: string;
          codes: { nodes: { code: string }[] };
          status: string;
          startsAt: string;
          endsAt: string | null;
          usageLimit: number | null;
          asyncUsageCount: number;
        };
      } | null;
    }>(query, { code });

    if (!result.codeDiscountNodeByCode) {
      return null;
    }

    const discount = result.codeDiscountNodeByCode;
    return {
      id: discount.id,
      code: discount.codeDiscount.codes.nodes[0].code,
      title: discount.codeDiscount.title,
      status: discount.codeDiscount.status,
      startsAt: discount.codeDiscount.startsAt,
      endsAt: discount.codeDiscount.endsAt,
      usageLimit: discount.codeDiscount.usageLimit,
      usageCount: discount.codeDiscount.asyncUsageCount,
    };
  }

  /**
   * Delete a discount code
   */
  async deleteDiscountCode(id: string): Promise<boolean> {
    const mutation = `
      mutation discountCodeDelete($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedCodeDiscountId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await this.graphql<{
      discountCodeDelete: {
        deletedCodeDiscountId: string | null;
        userErrors: { field: string; message: string }[];
      };
    }>(mutation, { id });

    if (result.discountCodeDelete.userErrors.length > 0) {
      throw new Error(
        `Failed to delete discount: ${result.discountCodeDelete.userErrors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    return !!result.discountCodeDelete.deletedCodeDiscountId;
  }

  /**
   * Get products (for test setup)
   */
  async getProducts(limit: number = 50): Promise<ShopifyProduct[]> {
    const response = await this.request<{
      products: ShopifyProduct[];
    }>(`/products.json?limit=${limit}`);

    return response.products;
  }

  /**
   * Get a single product
   */
  async getProduct(productId: string): Promise<ShopifyProduct> {
    const response = await this.request<{
      product: ShopifyProduct;
    }>(`/products/${productId}.json`);

    return response.product;
  }

  /**
   * Create a discount code specifically for an A/B test variant
   */
  async createTestVariantDiscount(
    testId: string,
    variantName: string,
    priceModifierCents: number,
    productIds?: string[]
  ): Promise<DiscountCode> {
    // Generate a unique code for this test variant
    const code = `AB_${testId.slice(0, 8)}_${variantName.toUpperCase().replace(/\s+/g, "_")}`;

    // Create as a fixed amount discount
    return this.createDiscountCode({
      code,
      title: `A/B Test: ${variantName}`,
      value: {
        type: "fixed_amount",
        value: Math.abs(priceModifierCents) / 100, // Convert cents to dollars
      },
      productIds,
      appliesOncePerCustomer: true,
    });
  }

  /**
   * Verify webhook signature (HMAC-SHA256)
   */
  static verifyWebhookSignature(
    body: string,
    signature: string,
    secret: string
  ): boolean {
    // In production, use crypto to verify HMAC
    // This is a placeholder - implement with actual crypto library
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", secret);
    const computedSignature = hmac.update(body, "utf8").digest("base64");
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }
}

/**
 * Create a Shopify client from environment variables
 */
export function createShopifyClient(): ShopifyClient {
  const store = process.env.SHOPIFY_STORE;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!store || !accessToken) {
    throw new Error(
      "Missing Shopify credentials. Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN"
    );
  }

  return new ShopifyClient({
    store,
    accessToken,
  });
}

/**
 * Generate a unique discount code for a test variant
 */
export function generateDiscountCode(testId: string, variantName: string): string {
  const shortTestId = testId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const cleanVariant = variantName.replace(/\s+/g, "").slice(0, 8).toUpperCase();
  return `AB${shortTestId}${cleanVariant}`;
}
