// Neon owns OAuth state, PKCE, and callback URLs. Only presentation hints change.
export function googleAccountChooser(value: string, authBase?: string): string {
  const url = new URL(value);
  // Neon Auth may hand back its own /sign-in/social/init hop, which then redirects to Google.
  if (authBase) {
    const base = new URL(authBase);
    if (url.protocol === "https:" && url.origin === base.origin && !url.username && !url.password
      && url.pathname.startsWith(`${base.pathname.replace(/\/+$/, "")}/`)) return url.href;
  }
  if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" || url.username || url.password)
    throw new Error("Google sign-in returned an unexpected authorization URL. Please try again.");
  const prompts = (url.searchParams.get("prompt") || "").split(" ").filter((item) => item === "consent");
  url.searchParams.set("prompt", [...new Set([...prompts, "select_account"])].join(" "));
  url.searchParams.delete("login_hint"); url.searchParams.delete("authuser");
  return url.href;
}
