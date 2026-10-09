import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { isAdminPath, safeReturnPath } from "@/lib/auth/navigation";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeReturnPath(typeof params.next === "string" ? params.next : params.mode === "admin" ? "/admin" : "/dashboard");
  const admin = isAdminPath(next);
  const user = await getCurrentUser();
  const error = typeof params.error === "string" ? params.error : undefined;
  if (user && (!admin || user.role === "admin") && !error && params.choose !== "1") redirect(next);
  return <AuthForm next={next} admin={admin} register={!admin && params.stage === "register"}
    initialError={error} signedInEmail={user?.email} />;
}
