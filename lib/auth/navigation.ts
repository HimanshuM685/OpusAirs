const PRIVATE_ROOTS = ["/dashboard", "/search", "/routes", "/heatmap", "/elasticity", "/admin"];

export function isProtectedPath(path: string): boolean {
  return PRIVATE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function isAdminPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  try {
    const url = new URL(value, "https://opusairs.invalid");
    if (url.origin !== "https://opusairs.invalid" || !isProtectedPath(url.pathname)) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/dashboard"; }
}

export function loginPath(next: string, error?: string): string {
  const target = safeReturnPath(next);
  const query = new URLSearchParams({ next: target });
  if (isAdminPath(target)) query.set("mode", "admin");
  if (error) query.set("error", error);
  return `/login?${query}`;
}
