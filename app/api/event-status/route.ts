export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** ✅ CORS: allow only these Webflow origins */
const ALLOWED_ORIGINS = new Set([
  "https://marlons-exceptional-site-82dbe2.webflow.io",
  "https://button-test-24044f.webflow.io",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** ✅ Rate limit: 120 req / 60 seconds per IP */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rlMap = new Map<string, { count: number; resetAt: number }>();

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : null) || "unknown";
}

function rateLimit(req: Request) {
  const ip = getIp(req);
  const now = Date.now();
  const entry = rlMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rlMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true as const, ip };
  }

  entry.count += 1;
  rlMap.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    return {
      ok: false as const,
      ip,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { ok: true as const, ip };
}

/** Preflight */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** GET /api/event-status?event_id=... */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const rl = rateLimit(req);

  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          "Retry-After": String(rl.retryAfterSec),
        },
      }
    );
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Create supabase early so we can log even on failures
  const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[event-status] Missing env vars", { ip: rl.ip });

    if (supabase) {
      await supabase.from("api_logs").insert({
        endpoint: "/api/event-status",
        ip: rl.ip,
        event_id: null,
        level: "error",
        message: "Missing Supabase env vars",
        payload: {
          hasSupabaseUrl: Boolean(SUPABASE_URL),
          hasServiceKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      });
    }

    return NextResponse.json(
      { error: "Missing Supabase env vars" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }

  const { searchParams } = new URL(req.url);
  const event_id = searchParams.get("event_id");

  if (!event_id) {
    if (supabase) {
      await supabase.from("api_logs").insert({
        endpoint: "/api/event-status",
        ip: rl.ip,
        event_id: null,
        level: "warn",
        message: "Missing event_id query param",
        payload: {},
      });
    }

    return NextResponse.json(
      { error: "Missing event_id" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  try {
    const { data: event, error } = await supabase!
      .from("events")
      .select("ticket_limit, tickets_sold, is_active")
      .eq("id", event_id)
      .single();

    // Fail closed: if we can't verify, don't sell
    if (error || !event) {
      if (supabase) {
        await supabase.from("api_logs").insert({
          endpoint: "/api/event-status",
          ip: rl.ip,
          event_id,
          level: "warn",
          message: "Event not found (fail closed)",
          payload: { error },
        });
      }

      return NextResponse.json(
        { soldOut: true, lowStock: false },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    const sold = event.tickets_sold ?? 0;
    const limit = event.ticket_limit ?? 0;

    const soldOut = !event.is_active || sold >= limit;

    const remaining = Math.max(0, limit - sold);
    const lowStock =
      !soldOut && (remaining <= 10 || remaining / Math.max(1, limit) <= 0.2);

    // ✅ Persistent log (success)
    await supabase!.from("api_logs").insert({
      endpoint: "/api/event-status",
      ip: rl.ip,
      event_id,
      level: "info",
      message: "Event status checked",
      payload: { soldOut, lowStock, remaining, sold, limit },
    });

    return NextResponse.json(
      { soldOut, lowStock },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err: any) {
    console.error("[event-status] error", { message: err?.message, ip: rl.ip });

    if (supabase) {
      await supabase.from("api_logs").insert({
        endpoint: "/api/event-status",
        ip: rl.ip,
        event_id,
        level: "error",
        message: "Unhandled server error",
        payload: { message: err?.message },
      });
    }

    return NextResponse.json(
      { soldOut: true, lowStock: false },
      { status: 200, headers: corsHeaders(origin) }
    );
  }
}
