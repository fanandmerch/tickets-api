export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase env vars" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get("event_id");

  if (!event_id) {
    return NextResponse.json(
      { error: "Missing event_id" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: event, error } = await supabase
    .from("events")
    .select("ticket_limit, tickets_sold, is_active")
    .eq("id", event_id)
    .single();

  if (error || !event) {
    return NextResponse.json(
      { soldOut: true }, // fail closed
      { status: 200 }
    );
  }

  const soldOut =
    !event.is_active ||
    (event.tickets_sold ?? 0) >= event.ticket_limit;

  return NextResponse.json({ soldOut });
}
