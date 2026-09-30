import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { robotsAllows } from "./robots";

const UA = "OpusAirs-APIx-Research/1.0";

describe("robotsAllows", () => {
  it("blocks a search path when Disallow covers it", () => {
    const text = "User-agent: *\nDisallow: /book\nAllow: /";
    assert.equal(robotsAllows(text, "/book/flight-select.html", UA), false);
    assert.equal(robotsAllows(text, "/", UA), true);
  });

  it("allows a path with no matching disallow", () => {
    const text = "User-agent: *\nDisallow: /private\n";
    assert.equal(robotsAllows(text, "/search", UA), true);
  });

  it("prefers a longer allow over a short disallow", () => {
    const text = "User-agent: *\nDisallow: /\nAllow: /search\n";
    assert.equal(robotsAllows(text, "/search", UA), true);
    assert.equal(robotsAllows(text, "/book", UA), false);
  });
});
