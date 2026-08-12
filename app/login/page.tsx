"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not log in.");
      window.location.href = "/";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">L</span>Lotly</div>
        <p className="eyebrow">PRIVATE LEDGER</p>
        <h1>Enter your password</h1>
        <p className="login-copy">This keeps your inventory, sales, and profit details private.</p>
        <form onSubmit={submitLogin}>
          <label>
            <span>Password</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your Lotly password"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="submit-button" disabled={loading || !password}>
            <span>{loading ? "Checking…" : "Open Lotly"}</span>
            <span>→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
