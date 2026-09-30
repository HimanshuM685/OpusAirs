"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAdmin } from "./actions";

export default function AdminSignInForm({ unconfigured }: { unconfigured: boolean }) {
  const [state, formAction, pending] = useActionState(signInAdmin, null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--grad-hero)",
        padding: "24px",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "36px 32px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: 8 }}>
          Opus<span style={{ color: "var(--accent-gold)" }}>Airs</span> Operator
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 20 }}>
          Sign in with Neon Auth. Only emails in <code>ADMIN_EMAIL</code> can open /admin.
        </p>
        {unconfigured && (
          <p className="err">Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET, then restart.</p>
        )}
        {state?.error && <p className="err">{state.error}</p>}
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p style={{ marginTop: 20 }}>
          <Link href="/">← Public portal</Link>
        </p>
      </div>
    </div>
  );
}
