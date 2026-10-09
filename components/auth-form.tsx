"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient, googleCallback } from "@/lib/auth/client";
import { loginPath } from "@/lib/auth/navigation";
import { api, clearApiCache } from "@/lib/api";
import { GoogleIcon } from "./google-icon";

type Stage = "ready" | "google" | "email" | "verifying" | "redirecting" | "verification-sent" | "signing-out";
const errors: Record<string, string> = {
  oauth: "Google sign-in was cancelled or could not be completed. Your destination is saved. Try again.",
  access: "This account needs verified Google sign-in and operator authorization. Use an authorized Google account or return to your dashboard.",
  expired: "Your session has ended. Sign in again to continue where you left off.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export function AuthForm({ register = false, admin = false, next = "/dashboard", initialError, signedInEmail }: {
  register?: boolean; admin?: boolean; next?: string; initialError?: string; signedInEmail?: string;
}) {
  const [stage, setStage] = useState<Stage>("ready");
  const [error, setError] = useState(initialError ? errors[initialError] || errors.oauth : null);
  const [emailOpen, setEmailOpen] = useState(register);
  const alert = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const busy = !["ready", "verification-sent"].includes(stage);
  const link = loginPath(next);

  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const resume = () => { active.current?.abort(); active.current = null; setStage("ready"); };
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, []);

  async function run(start: Stage, task: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException("Sign-in timed out. Check your connection and try again.", "TimeoutError")), 20000);
    setError(null); setStage(start);
    try { await task(controller.signal); }
    catch (err) {
      if (!controller.signal.aborted || controller.signal.reason?.name === "TimeoutError") {
        setError(controller.signal.reason?.name === "TimeoutError" ? controller.signal.reason.message : err instanceof Error ? err.message : "Sign-in failed. Please try again.");
        setStage("ready");
      }
    } finally { clearTimeout(timer); if (active.current === controller) active.current = null; }
  }

  function googleSignIn() {
    void run("google", async (signal) => {
      const callbackURL = googleCallback(next);
      const result = await authClient.signIn.social({ provider: "google", callbackURL,
        errorCallbackURL: callbackURL, disableRedirect: true, fetchOptions: { signal } });
      if (result.error) throw new Error(result.error.message || "Google sign-in failed. Please try again.");
      if (!result.data?.url) throw new Error("Google sign-in did not return a destination. Please try again.");
      if (signal.aborted) return;
      setStage("redirecting");
      window.location.assign(result.data.url);
    });
  }

  function emailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    void run("email", async (signal) => {
      const result = register
        ? await authClient.signUp.email({ name: String(fields.get("name") || "").trim(), email, password,
          callbackURL: `${window.location.origin}${link}`, fetchOptions: { signal } })
        : await authClient.signIn.email({ email, password, fetchOptions: { signal } });
      if (result.error) throw new Error(result.error.message || "Check your email and password, then try again.");
      if (register && !result.data?.token) { setStage("verification-sent"); return; }
      setStage("verifying");
      const me = await api<{ authenticated: boolean }>("/v1/auth/me", { signal });
      if (!me.authenticated) throw new Error("Your session could not be verified. Check that cookies are enabled, then sign in again.");
      if (signal.aborted) return;
      setStage("redirecting");
      // New document discards user-specific in-memory data and stale router state.
      window.location.replace(next);
    });
  }

  function switchAccount() {
    void run("signing-out", async (signal) => {
      const result = await authClient.signOut({ fetchOptions: { signal } });
      if (result.error) throw new Error(result.error.message || "Sign out failed. Please try again.");
      clearApiCache();
      try { sessionStorage.removeItem("opus-ingest-draft"); } catch { /* optional local draft */ }
      try { localStorage.setItem("opus-signout", String(Date.now())); } catch { /* storage may be disabled */ }
      if (!signal.aborted) window.location.replace(link);
    });
  }

  return <main id="main-content" className="auth-page">
    <Link href="/" className="auth-brand" translate="no">OpusAirs</Link>
    <div className="auth-card" aria-busy={busy}>
      <header className="auth-header">
        <h1>{admin ? "Operator sign in" : register ? "Create your account" : "Sign in to OpusAirs"}</h1>
        <p>{admin ? "Google sign-in is required for operator access." : "Your airfare workspace starts here. Sign in to explore indices and compare collected fares."}</p>
      </header>
      <ol className="auth-steps" aria-label="Sign-in progress">
        <li aria-current={stage === "ready" || stage === "email" || stage === "google" ? "step" : undefined}>Sign in</li>
        <li aria-current={stage === "verifying" || stage === "verification-sent" ? "step" : undefined}>Verify</li>
        <li aria-current={stage === "redirecting" ? "step" : undefined}>Open workspace</li>
      </ol>
      {error && <div ref={alert} tabIndex={-1} className="auth-error" role="alert">{error}</div>}
      {signedInEmail && admin && <div className="auth-account">
        <p>Current account: <strong>{signedInEmail}</strong></p>
        <button type="button" disabled={busy} onClick={switchAccount}>Sign out & switch account</button>
        <Link href="/dashboard">Return to dashboard</Link>
      </div>}
      <div role="status" className="auth-status" aria-live="polite">
        {stage === "google" ? "Connecting to Google…" : stage === "email" ? "Checking your details…" : stage === "verifying" ? "Verifying your session…" : stage === "redirecting" ? "Opening your destination…" : stage === "signing-out" ? "Signing out…" : stage === "verification-sent" ? "Account created. Check your email for a verification link, then sign in." : ""}
      </div>
      <button type="button" className="auth-google" disabled={busy} onClick={googleSignIn}>
        <GoogleIcon /> Continue with Google
      </button>
      <p className="auth-hint">{admin ? "Verified, allowlisted Google accounts only." : "Recommended · managed by Neon Auth"}</p>
      {!admin && <details className="auth-secondary" open={emailOpen} onToggle={(e) => setEmailOpen(e.currentTarget.open)}>
        <summary>Use email and password</summary>
        <form className="auth-form" onSubmit={emailSignIn}>
          {register && <div className="auth-field"><label htmlFor="auth-name">Name</label><input id="auth-name" name="name" autoComplete="name" required maxLength={100} disabled={busy} /></div>}
          <div className="auth-field"><label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" autoComplete="email" spellCheck={false} required disabled={busy} /></div>
          <div className="auth-field"><label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"}
            required minLength={register ? 8 : undefined} maxLength={128} disabled={busy} />{register && <span className="auth-hint">At least 8 characters.</span>}</div>
          <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : register ? "Create account with email" : "Sign in with email"}</button>
        </form>
      </details>}
      {!admin && <p className="auth-footer">{register ? "Already registered? " : "New to OpusAirs? "}<Link href={register ? link : `${link}&stage=register`}>{register ? "Sign in" : "Create account"}</Link></p>}
      <p className="auth-footer"><Link href="/">Return to home</Link></p>
    </div>
  </main>;
}
