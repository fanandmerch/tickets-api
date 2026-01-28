export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** ✅ CORS: allow only these Webflow origins */
const ALLOWED_ORIGINS = new Set([
  "https://marlons-exceptional-site-82dbe2.webflow.io",
  "https://button-test-24044f.webflow.io",
  // Add your custom prod domain later:
  // "https://tickets.yourdomain.com",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** ✅ Rate limit: 30 checkout attempts / 5 min per IP */
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX = 30;
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
    return { ok: true, ip };
  }

  entry.count += 1;
  rlMap.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    return { ok: false, ip, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { ok: true, ip };
}

/** Preflight */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** Health check */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  return NextResponse.json(
    {
      ok: true,
      message:
        "create-checkout endpoint is live. Use POST to create a Stripe Checkout session.",
    },
    { status: 200, headers: corsHeaders(origin) }
  );
}

export async function POST(req: Request) {
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

  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[create-checkout] Missing env vars", { ip: rl.ip });
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500, headers: corsHeaders(origin) }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { event_id, quantity = 1, purchaser_email = "" } = body || {};

    if (!event_id) {
      return NextResponse.json(
        { error: "Missing event_id" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1 || qty > 10) {
      return NextResponse.json(
        { error: "Invalid quantity (must be 1-10)" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, ticket_limit, tickets_sold, is_active")
      .eq("id", event_id)
      .single();

    if (error || !event) {
      console.warn("[create-checkout] Event not found", { ip: rl.ip, event_id });
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    if (!event.is_active) {
      return NextResponse.json(
        { error: "Event is inactive" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    if ((event.tickets_sold || 0) + qty > event.ticket_limit) {
      return NextResponse.json(
        { error: "Sold out" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const success_url =
      "https://marlons-exceptional-site-82dbe2.webflow.io/success?session_id={CHECKOUT_SESSION_ID}";
    const cancel_url =
      "https://marlons-exceptional-site-82dbe2.webflow.io/cancel";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: purchaser_email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Ticket: ${event.title}` },
            unit_amount: 7500,
          },
          quantity: qty,
        },
      ],
      success_url,
      cancel_url,
      metadata: {
        event_id: String(event_id),
        quantity: String(qty),
        purchaser_email: String(purchaser_email || ""),
      },
    });

    console.log("[create-checkout] session created", {
      ip: rl.ip,
      event_id,
      qty,
      session_id: session.id,
    });

    return NextResponse.json(
      { url: session.url },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err: any) {
    console.error("[create-checkout] error", { message: err?.message, ip: rl.ip });
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
