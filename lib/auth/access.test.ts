import assert from "node:assert/strict";
import { it } from "node:test";
import { handleV1 } from "../api-routes";
import { isAdminPath, loginPath, safeReturnPath } from "./navigation";

it("rejects anonymous warehouse and admin calls before attempting database bootstrap", async () => {
  const paths = ["index", "search", "trends/DEL/BOM", "routes", "quotes", "heatmap", "elasticity", "health", "health/collection", "jobs", "backtest/dgca", "bulletin", "ingest/template", "collect/control", "collect/monitor"];
  for (const path of paths) {
    const response = await handleV1(new Request(`https://app.example/v1/${path}`), path.split("/"));
    assert.equal(response.status, 401, path);
  }
});

it("legacy cookies cannot read private data or enqueue work", async () => {
  for (const path of ["ingest/dump", "ingest/csv", "collect/run", "index/rebuild", "collect/control"]) {
    const response = await handleV1(new Request(`https://app.example/v1/${path}`, { method: "POST", headers: { cookie: "opus_admin=old-proof; opus_session=old-proof" } }), path.split("/"));
    assert.equal(response.status, 401, path);
  }
});

it("machine keys cannot substitute for user or operator sessions on other endpoints", async () => {
  const previous = process.env.INGEST_API_KEY;
  process.env.INGEST_API_KEY = "fixture-machine-key";
  try {
    for (const path of ["index", "search", "health", "health/collection", "bulletin", "collect/sources", "ingest/needed", "collect/control", "collect/monitor"]) {
      const response = await handleV1(new Request(`https://app.example/v1/${path}`, { headers: { "x-api-key": "fixture-machine-key" } }), path.split("/"));
      assert.equal(response.status, 401, path);
    }
    const denied = await handleV1(new Request("https://app.example/v1/jobs", { headers: { "x-api-key": "wrong-key" } }), ["jobs"]);
    assert.equal(denied.status, 401);
  } finally {
    if (previous === undefined) delete process.env.INGEST_API_KEY; else process.env.INGEST_API_KEY = previous;
  }
});

it("login keeps local destinations, derives operator mode, and rejects loops/open redirects", () => {
  const url = new URL(loginPath("/admin/ingest?job=example", "expired"), "https://app.example");
  assert.equal(url.searchParams.get("next"), "/admin/ingest?job=example");
  assert.equal(url.searchParams.get("mode"), "admin");
  for (const next of ["/admin?tab=jobs", "/admin#status", "/admin/ingest?job=example"]) {
    assert.equal(new URL(loginPath(next), "https://app.example").searchParams.get("mode"), "admin");
    assert.equal(isAdminPath(safeReturnPath(next)), true);
  }
  assert.equal(isAdminPath("/search?next=/admin"), false);
  assert.equal(safeReturnPath("/search?origin=DEL&dest=BOM"), "/search?origin=DEL&dest=BOM");
  for (const next of ["//attacker.invalid", "/login", "/register", "/auth/callback", "/api/auth", "/v1/index", "/search/../../login", "/\\evil.invalid", "/admin\t.evil.invalid"]) {
    assert.equal(safeReturnPath(next), "/dashboard", next);
  }
});
