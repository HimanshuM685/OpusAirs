import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { headers } from "next/headers";
import { loginPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const next = (await headers()).get("x-opus-return-path") || "/admin";
  if (!user) redirect(loginPath(next));
  if (user.role !== "admin") redirect(loginPath(next, "access"));
  return <AdminShell user={user}>{children}</AdminShell>;
}
