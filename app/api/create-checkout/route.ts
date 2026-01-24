import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event_id, quantity = 1, purchaser_email = "" } = body;

    if (!event_id) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }

    if (quantity < 1 || quantity > 10) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, ticket_limit, tickets_sold, is_active")
      .eq("id", event_id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.is_active) {
      return NextResponse.json({ error: "Event is inactive" }, { status: 400 });
    }

    if ((event.tickets_sold || 0) + quantity > event.ticket_limit) {
      return NextResponse.json({ error: "Sold out" }, { status: 400 });
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
            unit_amount: 7500, // $75.00 per ticket
          },
          quantity,
        },
      ],
      success_url:
        "https://button-test-24044f.webflow.io/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://button-test-24044f.webflow.io/cancel",
      metadata: {
        event_id,
        quantity: String(quantity),
        purchaser_email,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
