import { test } from "node:test";
import { strict as assert } from "node:assert";
import { csrfToken } from "../src/auth.js";
test("CSRF remains stable across two dashboard tabs, rotates with session",()=>{
  const secret="a-32-character-or-longer-session-secret";
  const tabA=csrfToken("session-token",secret);
  const tabB=csrfToken("session-token",secret);
  assert.equal(tabA,tabB);
  assert.notEqual(tabA,csrfToken("different-session",secret));
  assert.notEqual(tabA,csrfToken("session-token",secret+"rotated"));
  assert.match(tabA,/^[\w-]{43}$/);
});
