import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl =
  process.env.NEON_AUTH_BASE_URL ||
  "https://ep-square-bonus-b3h0cv5s.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";

const secret =
  process.env.NEON_AUTH_COOKIE_SECRET ||
  process.env.SESSION_SECRET ||
  "default_neon_auth_cookie_secret_at_least_32_characters_long_min_secret";

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret,
  },
});
