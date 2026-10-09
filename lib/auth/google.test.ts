import assert from "node:assert/strict";
import { it } from "node:test";
import { googleAccountChooser } from "./google";

it("preserves Google consent and OAuth parameters while removing account hints", () => {
  const url = new URL(googleAccountChooser("https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&state=original&redirect_uri=https%3A%2F%2Fauth.example%2Fcallback&login_hint=old%40example.com"));
  assert.equal(url.searchParams.get("prompt"), "consent select_account");
  assert.equal(url.searchParams.get("state"), "original");
  assert.equal(url.searchParams.get("redirect_uri"), "https://auth.example/callback");
  assert.equal(url.searchParams.has("login_hint"), false);
  for (const target of ["http://accounts.google.com/auth", "https://accounts.google.com.evil.test/auth", "javascript:alert(1)", "https://user:secret@accounts.google.com/auth"])
    assert.throws(() => googleAccountChooser(target));
});
