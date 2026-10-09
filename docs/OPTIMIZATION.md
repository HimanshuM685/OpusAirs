# Experience Optimization and Verification

Local audit completed on 2026-10-09 using Next.js 16.4.0, Node.js 22, a production build, and headless Chromium. Vercel CLI/project metrics were unavailable; the user approved a local audit. Results below describe local bundle/request/rendering behavior, not production latency, Core Web Vitals, or billing savings.

## Changes and Evidence

| Priority | Finding and change | Evidence / tradeoff |
| --- | --- | --- |
| 1 | Analytics and operator entry points now authorize on the server before views mount or warehouse work starts. Login is one staged flow with preserved destinations and recoverable errors. | Browser checks: anonymous deep links reach login with zero warehouse requests; private APIs return 401/no-store; regular users cannot enter admin. Unit tests retain session-bound Google proof and allowlist enforcement. |
| 2 | Removed continuous authenticated-shell animation, route-remount templates, and the sign-in SDK from the sign-out component. Charts are code-split and off-screen search history is deferred. | Initial search decoded JavaScript decreased from 1,448,765 to 543,134 bytes (62.5%). Search has no canvas or running animations at either tested viewport. |
| 3 | Shared browser reads, independent fare/history resources, cancellation, bounded timeouts, and visibility-aware sequential polling replace redundant fetch lifecycles. | Browser checks: one fare request and one history request on initial search, stale responses cannot replace the current route, route data is reused during navigation, and hidden-tab operator polling stops/resumes. |
| 4 | Ingestion/rebuild inputs now persist in `pipeline_jobs`; execution belongs to the durable worker rather than detached HTTP work. | PostgreSQL-WASM integration exercises persisted CSV, stale-running recovery, successful ingestion/rebuild, and failed parsing. A separate worker is now required for these operations. |
| 5 | Bounded tables, shared loading/error/empty states, URL filters, responsive shells, focus styles, and reduced-motion behavior replace heavy page-specific rendering. | Desktop/mobile screenshots reviewed; search, dashboard, heatmap, booking windows, and operator collection checks report no document overflow at tested sizes. |

## Local Search Measurements

Initial route: `/search?origin=CCU&dest=BOM`. Browser warehouse fixtures supply 50 observations and a short history series. Viewports: 1440×1000 and 390×844.

| Measurement | Earlier local baseline | Final local run |
| --- | ---: | ---: |
| Decoded JavaScript resource bytes | 1,448,765 | 543,134 |
| Duplicate initial history requests | 1 | 0 |
| Canvas elements | 1 | 0 |
| Running animations | 10 | 0 |
| Mobile document overflow | Yes | No |

JavaScript is the sum of `PerformanceResourceTiming.decodedBodySize` for `.js` resources after the initial fare table loads, before scrolling to the deferred chart. This is uncompressed resource volume, not network transfer size or the total bundle after every lazy feature loads. The earlier baseline and final fixture-backed runs are observations from this audit, not a controlled production A/B experiment. Final results are reproduced by `scripts/verify-experience.mjs` and written to `.next/experience/results.json`; earlier baseline artifacts were temporary.

The final auth-bundle change alone reduced the preceding local result from 958,896 to 543,134 bytes. The shell's sign-out button calls the same `/api/auth/sign-out` Neon proxy directly, preserving session revocation and Google-proof cleanup.

## Reproduce Checks

### Build and standard tests

```bash
npm ci
npm test
npm run build
```

The build passes TypeScript and reports `/` as static; analytics, admin, login, and API routes are dynamic. Root `proxy.ts` only carries the return path; server layouts and APIs enforce authentication.

### PostgreSQL integration

The SQL integration test is opt-in. Use a disposable PostgreSQL container named `opusairs-collection-test` via `COLLECT_TEST_POSTGRES_CONTAINER`, or install PostgreSQL-WASM outside the application:

```bash
npm install --prefix /tmp/opusairs-pglite --no-audit --no-fund @electric-sql/pglite
COLLECT_TEST_PGLITE_MODULE=/tmp/opusairs-pglite/node_modules/@electric-sql/pglite/dist/index.js npm test
```

Verified result with PGlite: **85 tests passed, zero failed or skipped**. Coverage includes auth diagnostics/proofs, anonymous and machine-key access boundaries, safe return paths, request cancellation/deduplication, no mutation retry, index math, durable jobs, collection budgets, and catalog/demo isolation. The integration test uses in-memory PostgreSQL and fixture network responses.

### Production-build browser checks

```bash
# Run after npm run build. Keep browser binaries outside .next:
npx playwright-core install chromium
# Linux hosts may also need:
npx playwright-core install-deps chromium
node scripts/verify-experience.mjs
```

The harness starts a local production server on port 3101 and stops it afterwards. Its preload refuses any Neon auth origin other than `https://auth.fixture.invalid/auth`; no application code imports the fixture. Browser routes provide warehouse data, so these checks do not require a live database or Google login.

Verified scenarios:

- Anonymous dashboard/search/route/heatmap/booking-window/operator deep links preserve their path and query, including `/admin?tab=jobs`.
- No anonymous warehouse reads; direct private API calls return 401 and `private, no-store`.
- Failed Google initiation and cancelled OAuth recover on login with the operator destination intact.
- One initial fare/history request, stale-response protection, and route-cache reuse.
- Deferred history renders a real chart when scrolled into view; changing its window does not refetch fares.
- Regular users are denied operator access; fixture Google proof admits the authorized operator.
- A data API 401 returns to login with an expired-session explanation and the original destination.
- Hidden-tab polling pauses and resumes on visibility.
- Sign-out clears the managed-session cookie and admin proof, then protected navigation returns to login.
- No search canvas/running animation or document overflow at tested desktop/mobile sizes.

Output: `.next/experience/results.json` and `experience-*.png`. These are ignored build artifacts and may be cleared by a later build. Full-page search screenshots can show an off-screen chart placeholder; the chart intentionally mounts when the viewport approaches it.

## Runtime Contract

- Start `npm run collect:worker` using the same database and matching revision as the web app. Compose starts both services. Install worker dependencies with `npm ci --include=dev` to include `tsx`.
- `/v1` responses remain private/no-store. Selected server reads have a 20-second memory-cache TTL; eligible client reads have a separate 20-second tab-local TTL, bounded to 50 entries. TTLs may compound across processes. Shorter server caching favors worker-result freshness and needs field database-load measurement.
- Mutations are not automatically retried. A timeout can leave the outcome unknown; inspect recent jobs before resubmitting.
- Job polling does not cache responses, stops at `ok`/`error`, and pauses when hidden/offline. Worker heartbeats are every 30 seconds; stale running jobs become eligible for recovery after five minutes.
- `INGEST_API_KEY` is limited to documented writer/job endpoints. Analytics still requires a Neon user session; operator access still requires verified, allowlisted, session-bound Google authentication.

## Production Follow-up

Deploy with explicit `NEON_AUTH_BASE_URL`, a dedicated `NEON_AUTH_COOKIE_SECRET` of at least 32 characters, configured Google/email providers, correct trusted origins, and `ADMIN_EMAILS`. Verify real Google/email login, email verification, operator denial/allowlisting, sign-out/revocation, and a worker-processed manual ingestion job.

Docker image builds were not executed because Docker was unavailable in the audit environment. Vercel deployment, real provider credentials, production session revocation, latency, and cost metrics remain deployment-time verification. Collect field LCP/INP/CLS, request duration/error rates, invocation/transfer usage, and database activity before assigning production gains or tuning cache policy further.
