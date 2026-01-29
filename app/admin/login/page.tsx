export default function AdminLogin() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Admin Login</h1>
      <form method="POST" action="/api/admin/login" style={{ marginTop: 12 }}>
        <label>Password</label>
        <div>
          <input name="password" type="password" style={{ padding: 8, width: 260 }} />
        </div>
        <button style={{ marginTop: 12, padding: 10 }}>Log in</button>
      </form>
    </main>
  );
}
