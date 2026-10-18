import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { verifyGitHubSignature } from "../apps/core/src/github.js";
import { canAccess, type Identity } from "../apps/core/src/auth.js";
import { readConfig } from "../apps/core/src/config.js";
const config = { ADMIN_ROLE_ID: "1282541815802892289" } as Parameters<
  typeof canAccess
>[2];
test("valid and invalid webhook signatures", () => {
  const body = Buffer.from('{"action":"published"}');
  const signature =
    "sha256=" +
    createHmac("sha256", "long-webhook-secret").update(body).digest("hex");
  assert.equal(
    verifyGitHubSignature(body, signature, "long-webhook-secret"),
    true,
  );
  assert.equal(
    verifyGitHubSignature(
      Buffer.from("tampered"),
      signature,
      "long-webhook-secret",
    ),
    false,
  );
  assert.equal(
    verifyGitHubSignature(body, "sha256=bad", "long-webhook-secret"),
    false,
  );
});
test("department roles have no global administrative power", () => {
  const dev: Identity = {
    userId: "123",
    roles: ["1503602652330594345"],
    csrfHash: "",
  };
  const admin: Identity = {
    userId: "123",
    roles: ["1282541815802892289"],
    csrfHash: "",
  };
  assert.equal(canAccess(dev, "network", config), true);
  assert.equal(canAccess(dev, "hosting", config), false);
  assert.equal(canAccess(admin, "hosting", config), true);
});
test("invalid config is rejected", () => {
  assert.throws(() => readConfig({}), /Invalid environment/);
});
