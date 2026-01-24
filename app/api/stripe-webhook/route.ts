export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !STRIPE_SECRET_KEY ||
    !STRIPE_WEBHOOK_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Missing env vars for webhook" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  let stripeEvent: Stripe.Event;

  try {
    const rawBody = await req.text(); // required for signature verification
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;

      const event_id = session.metadata?.event_id;
      const quantity = Number(session.metadata?.quantity || "1");
      const purchaser_email =
        session.customer_details?.email ||
        session.metadata?.purchaser_email ||
        "";

      if (!event_id) {
        return NextResponse.json(
          { error: "Missing event_id in session metadata" },
          { status: 400 }
        );
      }

      // ✅ Idempotency: if we've already processed this Stripe session, do nothing
      const { data: existing, error: existingErr } = await supabase
        .from("tickets")
        .select("id")
        .eq("stripe_session_id", session.id)
        .limit(1);

      if (existingErr) {
        return NextResponse.json(
          { error: `Ticket lookup failed: ${existingErr.message}` },
          { status: 500 }
        );
      }

      if (existing && existing.length > 0) {
        return NextResponse.json({ received: true, deduped: true });
      }

      // 1) Increment tickets_sold (atomic)
      const { error: incErr } = await supabase.rpc("increment_tickets_sold", {
        p_event_id: event_id,
        p_qty: quantity,
      });

      if (incErr) {
        // If sold_out, return 200 so Stripe doesn't retry forever
        if (String(incErr.message || "").includes("sold_out")) {
          return NextResponse.json({ received: true, sold_out: true });
        }
        return NextResponse.json(
          { error: `Failed to increment tickets_sold: ${incErr.message}` },
          { status: 500 }
        );
      }

      // 2) Insert ticket rows (one per ticket)
      const tickets = Array.from({ length: quantity }).map(() => ({
        event_id,
        purchaser_email,
        stripe_session_id: session.id,
        status: "paid",
        checked_in: false,
      }));

      const { error: ticketErr } = await supabase.from("tickets").insert(tickets);

      if (ticketErr) {
        return NextResponse.json(
          { error: `Failed to create tickets: ${ticketErr.message}` },
          { status: 500 }
        );
      }
    }

    // Always acknowledge receipt so Stripe doesn't keep retrying other event types
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Webhook handler error" },
      { status: 500 }
    );
  }
}
