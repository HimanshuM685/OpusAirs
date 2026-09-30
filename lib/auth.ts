import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

export const COOKIE_NAME = "opus_session";
export const ADMIN_COOKIE = "opus_admin";

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

export function adminSeedEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export function adminSeedPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function adminConfigured(): boolean {
  return Boolean(adminSeedEmail() && adminSeedPassword());
}

function sameSecret(given: string, expected: string): boolean {
  const left = createHash("sha256").update(given).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function signAdmin(email: string): string {
  return createHmac("sha256", sessionSecret()).update(`admin:${email}`).digest("hex");
}

export function makeAdminCookie(): string {
  const email = adminSeedEmail();
  const sig = signAdmin(email);
  return `${ADMIN_COOKIE}=${encodeURIComponent(email)}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function makeAdminLogoutCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseAdminSession(req: Request): string | null {
  if (!adminConfigured()) return null;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${ADMIN_COOKIE}=([^;]*)`));
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const email = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = adminSeedEmail();
  if (email !== expected || sig.length !== signAdmin(email).length) return null;
  const left = Buffer.from(sig);
  const right = Buffer.from(signAdmin(email));
  if (!timingSafeEqual(left, right)) return null;
  return email;
}

export function loginAdmin(emailRaw: string, password: string): boolean {
  const email = adminSeedEmail();
  const expected = adminSeedPassword();
  if (!email || !expected) return false;
  if (emailRaw.trim().toLowerCase() !== email) return false;
  return sameSecret(password, expected);
}

export async function requireAdmin(req: Request): Promise<AuthUser | Response> {
  const email = parseAdminSession(req);
  if (!email) return Response.json({ detail: "Admin required" }, { status: 401 });
  return { id: 0, email, role: "admin" };
}

export function isAuthResponse(value: AuthUser | Response): value is Response {
  return value instanceof Response;
}

export function normalizeLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
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
