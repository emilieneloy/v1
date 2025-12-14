import { createClient } from "@v1/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Shopify OAuth Callback
 *
 * GET /api/auth/shopify/callback
 *
 * Handles the OAuth callback from Shopify:
 * 1. Verifies CSRF state
 * 2. Verifies HMAC signature
 * 3. Exchanges authorization code for access token
 * 4. Stores shop + token in database
 */

function verifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;

  // Create a copy without hmac for verification
  const params = new URLSearchParams(query);
  params.delete("hmac");

  // Sort and join parameters
  const sortedParams = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  // Compute HMAC
  const computedHmac = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(computedHmac, "hex")
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  // Validate required parameters
  if (!code || !shop || !state) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  // Verify CSRF state
  const storedNonce = request.cookies.get("shopify_oauth_nonce")?.value;
  if (state !== storedNonce) {
    return NextResponse.json(
      { error: "CSRF validation failed" },
      { status: 400 }
    );
  }

  // Verify HMAC signature
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (clientSecret && !verifyHmac(searchParams, clientSecret)) {
    return NextResponse.json(
      { error: "HMAC validation failed" },
      { status: 401 }
    );
  }

  // Exchange authorization code for access token
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Shopify OAuth not configured" },
      { status: 500 }
    );
  }

  try {
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange failed:", error);
      return NextResponse.json(
        { error: "Failed to exchange authorization code" },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.json(
        { error: "No access token received" },
        { status: 400 }
      );
    }

    // Store in database
    const supabase = createClient();

    // Upsert shop record (update if exists, insert if new)
    const { error: dbError } = await supabase
      .from("shopify_stores")
      .upsert(
        {
          shop,
          access_token: tokenData.access_token,
          scope: tokenData.scope,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "shop",
        }
      );

    if (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to store shop credentials" },
        { status: 500 }
      );
    }

    // Clear OAuth cookies
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const response = NextResponse.redirect(`${appUrl}/?shop=${shop}`);

    response.cookies.delete("shopify_oauth_nonce");
    response.cookies.delete("shopify_oauth_shop");

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
