import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function AdminHome() {
  const cookieStore = cookies();
  const authed = cookieStore.get("admin_authed")?.value === "true";
  if (!authed) redirect("/admin/login");

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Admin Dashboard</h1>
      <p>Events + logs + analytics</p>

      <section style={{ marginTop: 24 }}>
        <h2>Events</h2>
        {/* This loads server-side from our API route */}
        <Events />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Recent Logs</h2>
        <Logs />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Analytics</h2>
        <Analytics />
      </section>
    </main>
  );
}

async function Events() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/events`, { cache: "no-store" });
  const data = await res.json();

  if (!data?.ok) return <pre>{JSON.stringify(data, null, 2)}</pre>;

  return (
    <table border={1} cellPadding={8} style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Limit</th>
          <th>Sold</th>
          <th>Remaining</th>
          <th>Active</th>
        </tr>
      </thead>
      <tbody>
        {data.events.map((e: any) => (
          <tr key={e.id}>
            <td>{e.title}</td>
            <td>{e.game_date}</td>
            <td>{e.ticket_limit}</td>
            <td>{e.tickets_sold}</td>
            <td>{Math.max(0, e.ticket_limit - e.tickets_sold)}</td>
            <td>{String(e.is_active)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Logs() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/logs`, { cache: "no-store" });
  const data = await res.json();

  if (!data?.ok) return <pre>{JSON.stringify(data, null, 2)}</pre>;

  return (
    <table border={1} cellPadding={8} style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Time</th>
          <th>Endpoint</th>
          <th>Level</th>
          <th>Event</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {data.logs.map((l: any) => (
          <tr key={l.id}>
            <td>{l.created_at}</td>
            <td>{l.endpoint}</td>
            <td>{l.level}</td>
            <td>{l.event_id || "-"}</td>
            <td>{l.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Analytics() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/admin/analytics`, { cache: "no-store" });
  const data = await res.json();

  if (!data?.ok) return <pre>{JSON.stringify(data, null, 2)}</pre>;

  return (
    <ul>
      <li>Status checks (last 7d): {data.statusChecks7d}</li>
      <li>Checkout sessions created (last 7d): {data.checkoutCreated7d}</li>
      <li>Tickets issued (last 7d): {data.ticketsIssued7d}</li>
    </ul>
  );
}
