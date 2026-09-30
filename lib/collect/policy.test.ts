import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageExitCode,
  degradedSources,
  pickBest,
  resumeJobs,
} from "./policy";

describe("resumeJobs", () => {
  it("returns stale running jobs to pending and leaves finished jobs alone", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const jobs = resumeJobs(
      [
        { id: 1, status: "done", attempts: 1, locked_at: null },
        { id: 2, status: "running", attempts: 1, locked_at: "2026-09-30T11:00:00Z" },
        { id: 3, status: "running", attempts: 3, locked_at: "2026-09-30T11:00:00Z" },
        { id: 4, status: "running", attempts: 1, locked_at: "2026-09-30T11:55:00Z" },
      ],
      now,
    );
    assert.equal(jobs[0].status, "done");
    assert.equal(jobs[1].status, "pending");
    assert.equal(jobs[2].status, "failed");
    assert.equal(jobs[3].status, "running");
  });
});

describe("pickBest", () => {
  it("keeps the more complete row and breaks ties on the lower fare", () => {
    const best = pickBest([
      { flight_no: "NA", base_fare: null, taxes: null, udf: null, convenience: null, total_fare: 4000, return_date: null },
      { flight_no: "6E201", base_fare: 4200, taxes: 500, udf: null, convenience: null, total_fare: 5100, return_date: null },
      { flight_no: "6E201", base_fare: 4200, taxes: 500, udf: null, convenience: null, total_fare: 4900, return_date: null },
    ]);
    assert.equal(best.total_fare, 4900);
    assert.equal(best.flight_no, "6E201");
  });
});

describe("coverageExitCode", () => {
  it("fails only on a throw or a queue that was never touched", () => {
    assert.equal(coverageExitCode({ threw: true, pendingAtStart: 0, attempted: 0 }), 1);
    assert.equal(coverageExitCode({ threw: false, pendingAtStart: 4, attempted: 0 }), 1);
    assert.equal(coverageExitCode({ threw: false, pendingAtStart: 4, attempted: 4 }), 0);
    assert.equal(coverageExitCode({ threw: false, pendingAtStart: 0, attempted: 0 }), 0);
  });

  it("flags a source blocked on more than half its attempts", () => {
    assert.deepEqual(
      degradedSources([
        { source: "indigo", blocked: 3, attempted: 4 },
        { source: "akasa", blocked: 1, attempted: 4 },
      ]),
      ["indigo"],
    );
  });
});
