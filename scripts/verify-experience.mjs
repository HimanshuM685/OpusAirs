// Run against a production build served with scripts/fixtures/auth-server.mjs.
// Only Neon responses and client warehouse data are mocked; server route gates,
// navigation, React rendering, and request lifecycles execute the real code.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const base = process.env.EXPERIENCE_BASE_URL || "http://localhost:3101";
const output = process.env.EXPERIENCE_OUTPUT || ".next/experience";
const secret = "fixture-cookie-secret-with-more-than-thirty-two-characters";
await mkdir(output, { recursive: true });
const server = process.env.EXPERIENCE_BASE_URL ? null : spawn(process.execPath,
  ["--import", "./scripts/fixtures/auth-server.mjs", "node_modules/next/dist/bin/next", "start", "--port", "3101"],
  { env: { ...process.env, NEON_AUTH_BASE_URL: "https://auth.fixture.invalid/auth", NEON_AUTH_COOKIE_SECRET: secret,
    ADMIN_EMAILS: "admin@example.com", DATABASE_URL: "", PORT: "3101" }, stdio: ["ignore", "ignore", "pipe"] });
let serverErrors = "";
server?.stderr.on("data", (data) => { serverErrors += data.toString(); });
let browser;
const results = [];
const health = { ok: true, coverage: .85, quality: "partial", vintage: "provisional", last_snapshot_at: "2026-10-09T00:30:00Z",
  sources: [], blocked_sources: [], progress: {}, cells: 100, observed_cells: 85, unavailable_cells: 15, airlines: {}, job: null };
const airports = ["DEL", "CCU", "BOM", "BLR", "MAA", "HYD", "AMD", "GOI", "PNQ", "COK"];
const routes = airports.flatMap((origin) => airports.filter((dest) => dest !== origin).map((destination) =>
  ({ origin, destination, weight: .0125, raw_passengers: 120000, latest_index: 106 }))).slice(0, 80);
const history = Array.from({ length: 15 }, (_, i) => ({ period_date: `2026-10-${String(i + 1).padStart(2, "0")}`, value: 100 + i, coverage: .85, imputed_share: .15, avg_fare: 5000 + i * 20, min_fare: 4800, max_fare: 6000 }));
async function signIn(context, admin = false) {
  const id = admin ? "admin" : "user";
  const cookies = [{ name: "__Secure-neon-auth.session_token", value: `fixture-${id}`, domain: new URL(base).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }];
  if (admin) {
    const payload = Buffer.from(JSON.stringify({ userId: id, sessionId: `${id}-session`, exp: Date.now() + 3600000 })).toString("base64url");
    const sig = createHmac("sha256", secret).update(`google-session:${payload}`).digest("base64url");
    cookies.push({ name: "opus_google_session", value: `${payload}.${sig}`, domain: new URL(base).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
  }
  await context.addCookies(cookies);
}
async function warehouse(page, requests, { slowSearch = false } = {}) {
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    let body = [];
    if (url.pathname === "/v1/routes") body = routes;
    else if (url.pathname === "/v1/search") {
      if (slowSearch && url.searchParams.get("origin") === "DEL") await new Promise((r) => setTimeout(r, 700));
      body = { origin: url.searchParams.get("origin"), destination: url.searchParams.get("dest"), quote_count: 50, cheapest: 5000,
        carriers: Array.from({ length: 50 }, (_, i) => ({ carrier: "6E", flight_no: `6E${i + 100}`, fare_class: "ECONOMY", dep_date: "2026-10-15", collected_on: "2026-10-09", total_fare: 5000, base_fare: 4000, taxes: 1000, udf: 0, convenience: 0 })) };
    } else if (url.pathname.startsWith("/v1/trends") || url.pathname.startsWith("/v1/index")) body = history;
    else if (url.pathname.startsWith("/v1/health")) body = health;
    else if (url.pathname === "/v1/collect/sources") body = { sources: [] };
    else if (url.pathname === "/v1/ingest/needed") body = { needed: [], count: 0 };
    else if (url.pathname === "/v1/auth/me") body = { authenticated: true };
    else if (url.pathname === "/v1/backtest/dgca") body = { rows: [], note: "No overlapping observations" };
    else if (url.pathname === "/v1/bulletin") body = { title: "Airfare bulletin", rows: history };
    else if (url.pathname === "/v1/elasticity") body = [1, 7, 15, 21, 30, 45].map((n) => ({ lead_time_days: n, mean_total_fare: 7000 - n * 20 }));
    else if (url.pathname === "/v1/heatmap") body = routes.slice(0, 2).flatMap((r) => history.map((h) => ({ ...h, origin: r.origin, destination: r.destination })));
    await route.fulfill({ json: body });
  });
}
try {
  if (server) {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode != null) throw new Error(serverErrors);
      try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Fixture server did not become ready: ${serverErrors}`);
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  // Anonymous requests must stop before warehouse access and before client views mount.
  const anon = await browser.newContext(); const page = await anon.newPage();
  let warehouseRequests = 0; page.on("request", (r) => { if (r.url().includes("/v1/")) warehouseRequests++; });
  for (const path of ["/dashboard", "/search?origin=DEL&dest=BOM", "/routes/DEL-BOM", "/heatmap", "/elasticity", "/admin?tab=jobs", "/admin/ingest"]) {
    await page.goto(base + path); await page.waitForURL("**/login?**");
    assert.equal(new URL(page.url()).searchParams.get("next"), path);
    if (path.startsWith("/admin")) await page.getByRole("heading", { name: "Operator sign in" }).waitFor();
  }
  assert.equal(warehouseRequests, 0);
  for (const path of ["index", "search", "routes", "health/collection", "jobs"]) {
    const response = await anon.request.get(`${base}/v1/${path}`);
    assert.equal(response.status(), 401);
    assert.match(response.headers()["cache-control"], /private, no-store/);
  }
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.locator(".auth-error").waitFor();
  await page.waitForFunction(() => !document.querySelector(".auth-google")?.disabled);
  assert.equal(new URL(page.url()).searchParams.get("next"), "/admin/ingest");
  assert.equal(await page.getByRole("button", { name: "Continue with Google" }).isEnabled(), true);
  assert.equal(await page.getByText("Use email and password", { exact: true }).count(), 0);
  await page.goto(`${base}/auth/callback?next=%2Fadmin%2Fingest&error=access_denied`);
  await page.waitForURL("**/login?**");
  assert.equal(new URL(page.url()).searchParams.get("mode"), "admin");
  await anon.close();
  results.push({ anonymousGate: "pass", noAnonymousWarehouseRequests: true, failedOAuthDestinationPreserved: true });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); await signIn(context);
    const page = await context.newPage(); const requests = []; const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await warehouse(page, requests, { slowSearch: true });
    await page.goto(`${base}/search?origin=CCU&dest=BOM`);
    await page.getByRole("heading", { name: "Fare breakdown" }).waitFor(); await page.waitForTimeout(900);
    assert.equal(requests.filter((p) => p.startsWith("/v1/trends/")).length, 1);
    assert.equal(requests.filter((p) => p.startsWith("/v1/search?")).length, 1);
    assert.equal(await page.locator("tbody tr").count(), 20);
    const metrics = await page.evaluate(() => ({ canvases: document.querySelectorAll("canvas").length,
      animations: document.getAnimations().filter((a) => a.playState === "running").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      jsBytes: performance.getEntriesByType("resource").filter((r) => r.name.includes(".js")).reduce((sum, r) => sum + r.decodedBodySize, 0) }));
    assert.equal(metrics.canvases, 0); assert.equal(metrics.animations, 0); assert.equal(metrics.overflow, false);
    await page.screenshot({ path: `${output}/experience-search-${viewport.width}.png`, fullPage: true });
    // An off-screen placeholder must become a real chart when reached. Changing
    // its history window must not refetch the independent fare-table resource.
    const faresBeforeWindow = requests.filter((p) => p.startsWith("/v1/search?")).length;
    await page.getByRole("heading", { name: "Price history", exact: true }).scrollIntoViewIfNeeded();
    await page.locator(".recharts-line-curve").first().waitFor({ state: "visible" });
    const updatedHistory = page.waitForResponse((response) => response.url().includes("/v1/trends/") && response.url().includes("window=3m"));
    await page.getByRole("button", { name: "3 months", exact: true }).click();
    await updatedHistory;
    assert.equal(requests.filter((p) => p.startsWith("/v1/search?")).length, faresBeforeWindow);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Rapid URL/filter changes cancel stale reads; the latest result stays selected.
    await page.evaluate(() => { history.pushState(null, "", "/search?origin=DEL&dest=BOM"); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { history.pushState(null, "", "/search?origin=CCU&dest=BLR"); });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator(".metric-strip strong").first().textContent(), "CCU → BLR");
    const routeCount = requests.filter((p) => p === "/v1/routes").length;
    await page.getByRole("link", { name: "Routes", exact: true }).click();
    await page.getByRole("heading", { name: "Basket routes", exact: true }).waitFor(); await page.waitForTimeout(300);
    assert.equal(requests.filter((p) => p === "/v1/routes").length, routeCount);
    for (const path of ["/dashboard", "/heatmap", "/elasticity"]) {
      await page.goto(base + path); await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path);
    }
    await page.goto(base + "/dashboard"); await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/experience-dashboard-${viewport.width}.png`, fullPage: true });
    await page.goto(base + "/admin"); await page.waitForURL("**/login?**");
    assert.equal(new URL(page.url()).searchParams.get("error"), "access");
    await context.clearCookies();
    await page.route("**/v1/search?**", (route) => route.fulfill({ status: 401, json: { detail: "Sign in required" } }));
    // Mount with a fixture session, then model revocation on the first data read.
    await signIn(context);
    await page.goto(`${base}/search?origin=DEL&dest=BOM`);
    await page.waitForURL("**/login?**");
    assert.equal(new URL(page.url()).searchParams.get("error"), "expired");
    assert.equal(new URL(page.url()).searchParams.get("next"), "/search?origin=DEL&dest=BOM");
    assert.ok(!errors.length, errors.join("\n"));
    results.push({ viewport, ...metrics, duplicateTrends: 0, deferredChart: "pass", independentHistoryWindow: "pass", staleResponseProtection: "pass", cacheReuse: "pass", regularUserAdminDenied: true, expiredSessionRecovery: "pass" });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }); await signIn(context, true);
  const admin = await context.newPage(); const requests = []; await warehouse(admin, requests);
  await admin.route("**/v1/health/collection", (route) => {
    requests.push("/v1/health/collection");
    return route.fulfill({ json: { ...health, scrape_enabled: true, job: {
      id: "7f06a003-1a54-4697-aa78-70c6220dd945", status: "queued", started_at: null, heartbeat_at: null,
    } } });
  });
  await admin.route("**/v1/collect/sources", (route) => {
    requests.push("/v1/collect/sources");
    return route.fulfill({ json: { sources: [{ id: "airindia", kind: "html", host: "www.airindia.com", source_rank: 12,
      enabled: true, runnable: true, robots: { verdict: "pending", notes: "The worker checks robots.txt before collecting fares.", checked_at: null } }] } });
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await admin.setViewportSize(viewport);
    await admin.goto(base + "/admin/scrape");
    await admin.getByRole("heading", { name: "Waiting for a collection worker" }).waitFor();
    await admin.getByText("Worker checks robots first", { exact: true }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Snapshot queued", exact: true }).isDisabled(), true);
    assert.equal(await admin.getByText("Loading adapters…", { exact: true }).count(), 0);
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await admin.screenshot({ path: `${output}/experience-admin-${viewport.width}.png`, fullPage: true });
  }
  // Visibility is deterministic here, without relying on headless tab throttling.
  await admin.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  const before = requests.length; await admin.waitForTimeout(16000); assert.equal(requests.length, before);
  await admin.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await admin.waitForTimeout(500); assert.ok(requests.length > before);
  results.push({ authorizedAdmin: "pass", queuedWorkerInstructions: "pass", adapterGateRendering: "pass", hiddenTabPolling: "paused", resumePolling: "pass" });
  await admin.getByRole("button", { name: "Sign out", exact: true }).click();
  await admin.waitForURL("**/login");
  const cookies = await context.cookies();
  assert.equal(cookies.some((cookie) => cookie.name === "__Secure-neon-auth.session_token" || cookie.name === "opus_google_session"), false);
  await admin.goto(base + "/admin"); await admin.waitForURL("**/login?**");
  results.push({ signOut: "pass", managedSessionAndAdminProofCleared: true });
  await context.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
} finally { await browser?.close(); server?.kill("SIGTERM"); }
