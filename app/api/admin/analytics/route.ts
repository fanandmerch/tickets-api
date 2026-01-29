export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const since = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const statusChecks = await supabase
    .from("api_logs")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", "/api/event-status")
    .gte("created_at", since);

  const checkoutCreated = await supabase
    .from("api_logs")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", "/api/create-checkout")
    .ilike("message", "%session created%")
    .gte("created_at", since);

  const ticketsIssued = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  return NextResponse.json({
    ok: true,
    statusChecks7d: statusChecks.count ?? 0,
    checkoutCreated7d: checkoutCreated.count ?? 0,
    ticketsIssued7d: ticketsIssued.count ?? 0,
  });
}
