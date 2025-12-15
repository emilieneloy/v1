import { createClient } from "@v1/supabase/server";
import { NextResponse } from "next/server";

/**
 * Health Check Endpoint
 *
 * GET /api/health
 *
 * Returns the health status of the application and its dependencies.
 * Used for monitoring and load balancer health checks.
 */

export async function GET() {
  const startTime = Date.now();

  try {
    const supabase = createClient();

    // Check database connectivity
    const { error: dbError } = await supabase
      .from("tests")
      .select("id")
      .limit(1);

    const latency = Date.now() - startTime;

    if (dbError) {
      return NextResponse.json(
        {
          status: "unhealthy",
          database: "disconnected",
          error: dbError.message,
          timestamp: new Date().toISOString(),
          latency_ms: latency,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      latency_ms: latency,
    });
  } catch (error) {
    const latency = Date.now() - startTime;

    return NextResponse.json(
      {
        status: "unhealthy",
        database: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        latency_ms: latency,
      },
      { status: 503 },
    );
  }
}
