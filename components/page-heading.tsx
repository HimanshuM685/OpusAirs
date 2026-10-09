import type { ReactNode } from "react";
export function PageHeading({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</header>;
}
