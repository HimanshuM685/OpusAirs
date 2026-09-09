import { createHash } from "node:crypto";

export const COOKIE_NAME = "opus_admin_session";

function getExpectedToken(): string {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD || "admin";
  return createHash("sha256").update(`opusairs:${user}:${pass}:admin_session_salt`).digest("hex");
}

export function checkCredentials(user?: string, pass?: string): boolean {
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin";
  return Boolean(user && pass && user === expectedUser && pass === expectedPass);
}

export function isAdminAuthenticated(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return false;
  return match[1] === getExpectedToken();
}

export function makeLoginCookie(): string {
  const token = getExpectedToken();
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function makeLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
