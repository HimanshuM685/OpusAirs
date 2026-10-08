import { createNeonAuth } from "@neondatabase/auth/next/server";
import { authConfig } from "./config";

export { authConfig } from "./config";

let instance: ReturnType<typeof createNeonAuth> | undefined;
// Lazy creation keeps static builds and collection workers independent of auth configuration.
export function getAuth() {
  return instance ??= createNeonAuth(authConfig());
}
