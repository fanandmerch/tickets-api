export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get("event_id");

  if (!event_id) {
    return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: event, error } = await supabase
    .from("events")
    .select("ticket_limit, tickets_sold, is_active")
    .eq("id", event_id)
    .single();

  // Fail closed: if we can't verify, don't sell
  if (error || !event) {
    return NextResponse.json({ soldOut: true, lowStock: false }, { status: 200 });
  }

  const sold = event.tickets_sold ?? 0;
  const limit = event.ticket_limit ?? 0;

  const soldOut = !event.is_active || sold >= limit;

  // "Almost sold out" rules (no counts exposed):
  // - triggers if remaining <= 10 OR remaining <= 20% of total
  const remaining = Math.max(0, limit - sold);
  const lowStock = !soldOut && (remaining <= 10 || remaining / Math.max(1, limit) <= 0.2);

  return NextResponse.json({ soldOut, lowStock });
}
