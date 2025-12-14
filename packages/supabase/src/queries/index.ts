import { logger } from "@v1/logger";
import { createClient } from "@v1/supabase/server";
import type { TestInsert, TestUpdate, VariantInsert, EventInsert, AssignmentInsert } from "../types";

// ============================================
// User Queries
// ============================================

export async function getUser() {
  const supabase = createClient();

  try {
    const result = await supabase.auth.getUser();
    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getUserProfile() {
  const supabase = createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };

    const result = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Tests Queries
// ============================================

export async function getTests() {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .select(`
        *,
        variants (*)
      `)
      .order("created_at", { ascending: false });

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getTest(id: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .select(`
        *,
        variants (*)
      `)
      .eq("id", id)
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getActiveTests() {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .select(`
        *,
        variants (*)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function createTest(data: TestInsert) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .insert(data)
      .select()
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function updateTest(id: string, data: TestUpdate) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function deleteTest(id: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("tests")
      .delete()
      .eq("id", id);

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Variants Queries
// ============================================

export async function createVariant(data: VariantInsert) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("variants")
      .insert(data)
      .select()
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function createVariants(data: VariantInsert[]) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("variants")
      .insert(data)
      .select();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getVariantsByTest(testId: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("variants")
      .select("*")
      .eq("test_id", testId);

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Assignments Queries
// ============================================

export async function getAssignment(testId: string, visitorId: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("assignments")
      .select(`
        *,
        variants (*)
      `)
      .eq("test_id", testId)
      .eq("visitor_id", visitorId)
      .single();

    return result;
  } catch (error) {
    // Not found is expected for new visitors
    if ((error as any)?.code === "PGRST116") {
      return { data: null, error: null };
    }
    logger.error(error);
    throw error;
  }
}

export async function createAssignment(data: AssignmentInsert) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("assignments")
      .insert(data)
      .select(`
        *,
        variants (*)
      `)
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Events Queries
// ============================================

export async function createEvent(data: EventInsert) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("events")
      .insert(data)
      .select()
      .single();

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getEventsByTest(testId: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("events")
      .select("*")
      .eq("test_id", testId)
      .order("created_at", { ascending: false });

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Stats Queries
// ============================================

export async function getTestStats(testId: string) {
  const supabase = createClient();

  try {
    const result = await supabase
      .from("test_stats")
      .select("*")
      .eq("test_id", testId);

    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function refreshTestStats() {
  const supabase = createClient();

  try {
    const result = await supabase.rpc("refresh_test_stats");
    return result;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

// ============================================
// Aggregated Stats (Real-time calculation)
// ============================================

export async function getTestResultsRealtime(testId: string) {
  const supabase = createClient();

  try {
    // Get variants
    const { data: variants, error: variantsError } = await supabase
      .from("variants")
      .select("*")
      .eq("test_id", testId);

    if (variantsError) throw variantsError;

    // Get stats for each variant
    const stats = await Promise.all(
      (variants || []).map(async (variant) => {
        // Count unique visitors (views)
        const { count: visitors } = await supabase
          .from("events")
          .select("visitor_id", { count: "exact", head: true })
          .eq("variant_id", variant.id)
          .eq("event_type", "view");

        // Count conversions (unique purchasers)
        const { count: conversions } = await supabase
          .from("events")
          .select("visitor_id", { count: "exact", head: true })
          .eq("variant_id", variant.id)
          .eq("event_type", "purchase");

        // Sum revenue
        const { data: revenueData } = await supabase
          .from("events")
          .select("revenue_cents")
          .eq("variant_id", variant.id)
          .eq("event_type", "purchase");

        const revenue = revenueData?.reduce((sum, e) => sum + (e.revenue_cents || 0), 0) || 0;

        return {
          variant_id: variant.id,
          variant_name: variant.name,
          visitors: visitors || 0,
          conversions: conversions || 0,
          revenue_cents: revenue,
          conversion_rate: visitors ? (conversions || 0) / visitors : 0,
          revenue_per_visitor: visitors ? revenue / visitors : 0,
        };
      })
    );

    return { data: stats, error: null };
  } catch (error) {
    logger.error(error);
    return { data: null, error };
  }
}
