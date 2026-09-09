"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { detail?: string; success?: boolean };
      if (!res.ok || !data.success) {
        setErr(data.detail || "Invalid email or password");
        return;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-changed"));
      }

      router.push("/search");
      router.refresh();
    } catch {
      setErr("Network or server connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon">
            👤
          </div>
          <h1>Welcome Back</h1>
          <p>Sign in to access search analytics, saved preferences, and index data.</p>
        </div>

        {err && (
          <div className="auth-error" role="alert">
            <span>⚠️</span>
            <span>{err}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-field">
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="text"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <div className="auth-password-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary auth-btn"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In →"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            No account yet? <Link href="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
