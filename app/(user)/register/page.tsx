"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match. Please verify.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/v1/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = (await res.json()) as { detail?: string; success?: boolean };
      if (!res.ok || !data.success) {
        setErr(data.detail || "Could not complete registration.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-changed"));
      }

      setTimeout(() => {
        router.push("/search");
        router.refresh();
      }, 500);
    } catch {
      setErr("Network or server connection error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon">
            ✈️
          </div>
          <h1>Create an Account</h1>
          <p>
            Track real-time airfares, compare domestic carriers, and monitor price index trends.
          </p>
        </div>

        {err && (
          <div className="auth-error" role="alert">
            <span>⚠️</span>
            <span>{err}</span>
          </div>
        )}

        {success && (
          <div
            style={{
              background: "var(--accent-green-dim)",
              color: "var(--accent-green)",
              border: "1px solid rgba(11, 59, 42, 0.25)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              fontSize: "13px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>✓</span>
            <span>Account created! Redirecting to flights...</span>
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-field">
            <label htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="reg-password">Password</label>
            <div className="auth-password-wrap">
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
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
            <span className="auth-hint">Must be at least 6 characters</span>
          </div>

          <div className="auth-field">
            <label htmlFor="reg-confirm">Confirm Password</label>
            <div className="auth-password-wrap">
              <input
                id="reg-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={6}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary auth-btn"
            type="submit"
            disabled={submitting || success}
          >
            {submitting ? "Creating Account..." : "Create Account →"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
