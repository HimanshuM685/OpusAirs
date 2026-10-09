import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { UserShell } from "@/components/user-shell";
import { headers } from "next/headers";
import { loginPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export default async function UserLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath((await headers()).get("x-opus-return-path") || "/dashboard"));
  return <UserShell user={user}>{children}</UserShell>;
}
