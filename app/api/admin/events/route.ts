export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Missing Supabase env vars" }, { status: 500 });

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("events")
    .select("id,title,game_date,ticket_limit,tickets_sold,is_active")
    .order("game_date", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
  return NextResponse.json({ ok: true, events: data });
}
