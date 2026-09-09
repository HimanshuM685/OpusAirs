import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

export const COOKIE_NAME = "opus_session";

export type AuthUser = { id: number; email: string; role: string };

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to sign session cookies");
  return secret;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

function sign(id: number): string {
  return createHmac("sha256", sessionSecret()).update(String(id)).digest("hex");
}

export function makeSessionCookie(userId: number): string {
  return `${COOKIE_NAME}=${userId}.${sign(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function makeLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseSession(req: Request): number | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  const [idStr, sig] = decodeURIComponent(match[1]).split(".");
  const id = Number(idStr);
  if (!id || !sig || sign(id) !== sig) return null;
  return id;
}

export async function findUserByEmail(email: string): Promise<(AuthUser & { password_hash: string }) | null> {
  const q = sql();
  const rows = (await q`
    SELECT id, email, role, password_hash FROM users WHERE email = ${email} LIMIT 1
  `) as { id: number; email: string; role: string; password_hash: string }[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    role: String(row.role),
    password_hash: String(row.password_hash),
  };
}

export async function createUser(email: string, password: string, role = "user"): Promise<AuthUser> {
  const q = sql();
  const hash = hashPassword(password);
  const rows = (await q`
    INSERT INTO users (email, password_hash, role) VALUES (${email}, ${hash}, ${role})
    RETURNING id, email, role
  `) as { id: number; email: string; role: string }[];
  const row = rows[0];
  return { id: Number(row.id), email: String(row.email), role: String(row.role) };
}

export async function getUser(req: Request): Promise<AuthUser | null> {
  const id = parseSession(req);
  if (!id) return null;
  const q = sql();
  const rows = (await q`SELECT id, email, role FROM users WHERE id = ${id} LIMIT 1`) as {
    id: number;
    email: string;
    role: string;
  }[];
  const row = rows[0];
  if (!row) return null;
  return { id: Number(row.id), email: String(row.email), role: String(row.role) };
}

export async function requireUser(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  if (!user) return Response.json({ detail: "Sign in required" }, { status: 401 });
  return user;
}

export async function requireAdmin(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  if (!user || user.role !== "admin") {
    return Response.json({ detail: "Admin required" }, { status: 401 });
  }
  return user;
}

export function isAuthResponse(value: AuthUser | Response): value is Response {
  return value instanceof Response;
}

export function adminSeedEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export function adminSeedPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function normalizeLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function ensureSeedAdmin(): Promise<void> {
  const email = adminSeedEmail();
  const password = adminSeedPassword();
  if (!email || !password) return;
  const q = sql();
  const hash = hashPassword(password);
  const existing = await q`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (!existing.length) {
    await q`
      INSERT INTO users (email, password_hash, role) VALUES (${email}, ${hash}, 'admin')
    `;
    return;
  }
  await q`
    UPDATE users SET password_hash = ${hash}, role = 'admin' WHERE email = ${email}
  `;
}

export function authJson(data: unknown, cookie: string, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
