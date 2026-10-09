import { redirect } from "next/navigation";
import { loginPath } from "@/lib/auth/navigation";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  redirect(`${loginPath((await searchParams).next || "/dashboard")}&stage=register`);
}
