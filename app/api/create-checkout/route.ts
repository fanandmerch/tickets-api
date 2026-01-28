export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ALLOWED_ORIGIN =
  "https://marlons-exceptional-site-82dbe2.webflow.io";

/* -------------------- */
/* CORS helper */
/* -------------------- */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/* -------------------- */
/* Preflight */
/* -------------------- */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

/* -------------------- */
/* Health check */
/* -------------------- */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message:
        "create-checkout endpoint is live. Use POST to create a Stripe Checkout session.",
    },
    { headers: corsHeaders() }
  );
}

/* -------------------- */
/* Checkout */
/* -------------------- */
export async function POST(req: Request) {
  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500, headers: corsHeaders() }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { event_id, quantity = 1, purchaser_email = "" } = body || {};

    if (!event_id) {
      return NextResponse.json(
        { error: "Missing event_id" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, ticket_limit, tickets_sold, is_active")
      .eq("id", event_id)
      .single();

    if (error || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404, headers: corsHeaders() }
      );
    }

    if (!event.is_active) {
      return NextResponse.json(
        { error: "Event is inactive" },
        { status: 400, headers: corsHeaders() }
      );
    }

    if ((event.tickets_sold || 0) + quantity > event.ticket_limit) {
      return NextResponse.json(
        { error: "Sold out" },
        { status: 400, headers: corsHeaders() }
      );
    }

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
          quantity,
        },
      ],
      success_url:
        "https://marlons-exceptional-site-82dbe2.webflow.io/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://marlons-exceptional-site-82dbe2.webflow.io/cancel",
      metadata: {
        event_id,
        quantity: String(quantity),
        purchaser_email,
      },
    });

    return NextResponse.json(
      { url: session.url },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
