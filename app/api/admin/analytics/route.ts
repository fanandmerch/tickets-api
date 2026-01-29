export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Missing Supabase env vars" }, { status: 500 });

  const supabase = createClient(url, key);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
