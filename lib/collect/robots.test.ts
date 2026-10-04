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

  it("merges adjacent user-agents and uses the most specific matching group", () => {
    const text = "User-agent: *\nDisallow: /\nUser-agent: OtherBot\nUser-agent: OpusAirs-APIx-Bot\nDisallow: /search\nAllow: /public\nUser-agent: OpusAirs\nAllow: /search";
    assert.equal(robotsAllows(text, "/search", "OpusAirs-APIx-Bot/1.0"), false);
    assert.equal(robotsAllows(text, "/public", "OpusAirs-APIx-Bot/1.0"), true);
  });

  it("handles wildcard, end anchor, query paths, and equal-length allow precedence", () => {
    const text = "User-agent: *\nDisallow: /*?fare=*$\nDisallow: /search\nAllow: /search\n";
    assert.equal(robotsAllows(text, "/flights?fare=123", UA), false);
    assert.equal(robotsAllows(text, "/search", UA), true);
    assert.equal(robotsAllows("User-agent: *\nDisallow: /search", "/%73earch", UA), false);
  });
});
