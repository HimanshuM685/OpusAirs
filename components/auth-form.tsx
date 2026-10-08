"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient, googleCallback } from "@/lib/auth/client";
import { GoogleIcon } from "./google-icon";

export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setError("Google sign-in could not be completed. Please try again.");
    }
  }, []);

  async function googleSignIn() {
    setError(null);
    setMessage(null);
    setBusy("google");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: googleCallback() });
      if (result.error) throw new Error(result.error.message || "Google sign-in failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(null);
    }
  }

  async function emailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    setError(null);
    setMessage(null);
    setBusy("email");
    try {
      const result = register
        ? await authClient.signUp.email({ name: String(fields.get("name") || "").trim(), email, password,
          callbackURL: `${window.location.origin}/login` })
        : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Email authentication failed.");
      if (register && !result.data?.token) {
        setMessage("Account created. Check your email for a verification link, then sign in.");
      } else {
        window.dispatchEvent(new Event("auth-changed"));
        router.push("/search");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email authentication failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon">{register ? "✨" : "👤"}</div>
          <h1>{register ? "Create Your Account" : "Welcome Back"}</h1>
          <p>{register ? "Join OpusAirs for airfare analytics and price comparisons." : "Sign in to access airfare analytics and index comparisons."}</p>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {message && <p role="status" className="auth-hint">{message}</p>}
        <button type="button" className="auth-google" disabled={busy !== null} onClick={() => void googleSignIn()}>
          <GoogleIcon />
          {busy === "google" ? "Redirecting to Google…" : "Continue with Google"}
        </button>
        <p className="auth-hint" style={{ textAlign: "center" }}>Recommended · managed by Neon Auth</p>
        <details className="auth-secondary">
          <summary>Use email and password instead</summary>
          <form className="auth-form" onSubmit={(event) => void emailSignIn(event)}>
            {register && <div className="auth-field">
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" name="name" autoComplete="name" required maxLength={100} disabled={busy !== null} />
            </div>}
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" name="email" type="email" autoComplete="email" required disabled={busy !== null} />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"}
                required minLength={register ? 8 : undefined} maxLength={128} disabled={busy !== null} />
              {register && <span className="auth-hint">At least 8 characters.</span>}
            </div>
            <button className="auth-btn" type="submit" disabled={busy !== null}>
              {busy === "email" ? "Please wait…" : register ? "Create account with email" : "Sign in with email"}
            </button>
          </form>
        </details>
        <div className="auth-footer">
          <p>{register ? "Already have an account? " : "Don't have an account yet? "}
            <Link href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create account"}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
