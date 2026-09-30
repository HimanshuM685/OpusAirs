import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentOperator } from "@/lib/auth";
import { signOutAdmin } from "@/app/(entry)/admin/sign-in/actions";
import AdminShell from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const operator = await currentOperator();
  if (!operator) redirect("/admin/sign-in");
  if (!operator.allowed) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <h1>Not an operator</h1>
        <p>
          Signed in as {operator.email}. That address is not in <code>ADMIN_EMAIL</code>.
        </p>
        <form action={signOutAdmin}>
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </div>
    );
  }
  return <AdminShell email={operator.email}>{children}</AdminShell>;
}
