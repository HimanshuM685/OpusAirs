import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "./db";
import { auth } from "./auth/server";

export const COOKIE_NAME = "opus_session";
export const ADMIN_COOKIE = "opus_admin";

export type AuthUser = {
  id: number | string;
  email: string;
  role: string;
  name?: string | null;
  image?: string | null;
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret) throw new Error("SESSION_SECRET or NEON_AUTH_COOKIE_SECRET is required to sign session cookies");
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

function sign(id: number | string): string {
  return createHmac("sha256", sessionSecret()).update(String(id)).digest("hex");
}

export function makeSessionCookie(userId: number | string): string {
  return `${COOKIE_NAME}=${userId}.${sign(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function makeLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; ${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseSession(req: Request): number | string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  const [idStr, sig] = decodeURIComponent(match[1]).split(".");
  if (!idStr || !sig || sign(idStr) !== sig) return null;
  return idStr;
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

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = getAdminEmails();
  return list.includes(email.trim().toLowerCase());
}

export function adminSeedEmail(): string {
  const list = getAdminEmails();
  return list[0] || (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export function adminSeedPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function adminConfigured(): boolean {
  return getAdminEmails().length > 0;
}

export async function getUser(req: Request): Promise<AuthUser | null> {
  // 1. Check Neon Auth managed Better Auth session via server helper
  try {
    const sessionRes = await auth.getSession().catch(() => null);
    if (sessionRes?.data?.user) {
      const u = sessionRes.data.user;
      const email = u.email?.trim().toLowerCase() || "";
      const isAdmin = isAdminEmail(email);
      return {
        id: u.id,
        email,
        name: u.name || null,
        image: u.image || null,
        role: isAdmin ? "admin" : (u.role || "user"),
      };
    }
  } catch {
    // Continue to database / cookie check
  }

  // 2. Direct lookup in neon_auth database schema using session cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const neonMatch = cookieHeader.match(/(?:better-auth\.session_token|neon-auth\.session-token)=([^;]+)/);
  if (neonMatch) {
    try {
      const rawToken = decodeURIComponent(neonMatch[1]).trim();
      const token = rawToken.split(".")[0];
      const q = sql();
      const rows = (await q`
        SELECT u.id, u.email, u.name, u.image, u.role
        FROM neon_auth.session s
        JOIN neon_auth.user u ON s."userId" = u.id
        WHERE (s.token = ${token} OR s.token = ${rawToken})
          AND s."expiresAt" > NOW()
        LIMIT 1
      `) as { id: string; email: string; name: string | null; image: string | null; role: string | null }[];

      if (rows.length > 0) {
        const u = rows[0];
        const email = u.email.trim().toLowerCase();
        const isAdmin = isAdminEmail(email);
        return {
          id: u.id,
          email,
          name: u.name,
          image: u.image,
          role: isAdmin ? "admin" : (u.role || "user"),
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Check legacy admin session cookie
  const adminEmail = parseAdminSession(req);
  if (adminEmail && isAdminEmail(adminEmail)) {
    return {
      id: "admin-session",
      email: adminEmail,
      name: "Operator",
      role: "admin",
    };
  }

  // 4. Check legacy signed session cookie (users table)
  const legacyId = parseSession(req);
  if (legacyId) {
    const q = sql();
    try {
      const rows = (await q`SELECT id, email, role FROM users WHERE id = ${Number(legacyId)} LIMIT 1`) as {
        id: number;
        email: string;
        role: string;
      }[];
      const row = rows[0];
      if (row) {
        const email = String(row.email).trim().toLowerCase();
        const isAdmin = isAdminEmail(email);
        return {
          id: Number(row.id),
          email,
          role: isAdmin ? "admin" : String(row.role),
        };
      }
    } catch {
      // Fallback
    }
  }

  return null;
}

export async function requireUser(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  if (!user) return Response.json({ detail: "Sign in required" }, { status: 401 });
  return user;
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
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; ${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseAdminSession(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${ADMIN_COOKIE}=([^;]*)`));
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const email = raw.slice(0, dot).trim().toLowerCase();
  const sig = raw.slice(dot + 1);
  if (!isAdminEmail(email)) return null;
  const expectedSig = signAdmin(email);
  if (sig.length !== expectedSig.length) return null;
  const left = Buffer.from(sig);
  const right = Buffer.from(expectedSig);
  if (!timingSafeEqual(left, right)) return null;
  return email;
}

export function loginAdmin(emailRaw: string, password: string): boolean {
  const email = emailRaw.trim().toLowerCase();
  if (!isAdminEmail(email)) return false;
  const expected = adminSeedPassword();
  if (!expected) return false;
  return timingSafeEqual(
    createHash("sha256").update(password).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export async function requireAdmin(req: Request): Promise<AuthUser | Response> {
  const user = await getUser(req);
  if (!user) {
    return Response.json({ detail: "Sign in required" }, { status: 401 });
  }
  if (!isAdminEmail(user.email) && user.role !== "admin") {
    return Response.json(
      { detail: `Admin access required. Email (${user.email}) is not in ADMIN_EMAILS.` },
      { status: 403 },
    );
  }
  return { ...user, role: "admin" };
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
