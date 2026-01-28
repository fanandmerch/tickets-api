export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://marlons-exceptional-site-82dbe2.webflow.io",
  "https://button-test-24044f.webflow.io",
];

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle preflight
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase env vars" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }

  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get("event_id");

  if (!event_id) {
    return NextResponse.json(
      { error: "Missing event_id" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: event, error } = await supabase
    .from("events")
    .select("ticket_limit, tickets_sold, is_active")
    .eq("id", event_id)
    .single();

  // Fail closed: if we can't verify, don't sell
  if (error || !event) {
    return NextResponse.json(
      { soldOut: true, lowStock: false },
      { status: 200, headers: corsHeaders(origin) }
    );
  }

  const sold = event.tickets_sold ?? 0;
  const limit = event.ticket_limit ?? 0;

  const soldOut = !event.is_active || sold >= limit;

  const remaining = Math.max(0, limit - sold);
  const lowStock = !soldOut && (remaining <= 10 || remaining / Math.max(1, limit) <= 0.2);

  return NextResponse.json(
    { soldOut, lowStock },
    { status: 200, headers: corsHeaders(origin) }
  );
}
