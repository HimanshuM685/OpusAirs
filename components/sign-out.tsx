"use client";
import { useState } from "react";
import { apiPost, clearApiCache } from "@/lib/api";

export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      // Use the same managed-session endpoint without loading the sign-in SDK
      // into every authenticated page's client bundle.
      await apiPost("/api/auth/sign-out", {}, { timeoutMs: 15000 });
      clearApiCache();
      try { sessionStorage.removeItem("opus-ingest-draft"); } catch { /* optional local draft */ }
      try { localStorage.setItem("opus-signout", String(Date.now())); } catch { /* storage may be disabled */ }
      window.location.replace("/login?choose=1");
    } catch (err) { setError(err instanceof Error ? err.message : "Sign out failed. Try again."); setBusy(false); }
  }
  return <div className="signout"><button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
    {error && <p role="alert">{error}</p>}</div>;
}
