"use server";

import { redirect } from "next/navigation";
import { adminEmails } from "@/lib/auth";
import { getNeonAuth } from "@/lib/auth/server";

export async function signInAdmin(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const neon = getNeonAuth();
  if (!neon) return { error: "Admin auth is not configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Email and password required" };
  const { error } = await neon.signIn.email({ email, password });
  if (error) return { error: error.message || "Sign in failed" };
  if (!adminEmails().has(email)) {
    await neon.signOut();
    return { error: "This account is not an operator" };
  }
  redirect("/admin");
}

export async function signOutAdmin(): Promise<void> {
  const neon = getNeonAuth();
  if (neon) await neon.signOut();
  redirect("/admin/sign-in");
}
