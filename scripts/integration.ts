import { migrate } from "@tfl/database/migrate";
const url = process.env.TEST_DATABASE_URL;
if (
  process.env.NODE_ENV !== "test" ||
  !url ||
  new URL(url).pathname !== "/studio_test"
)
  throw new Error(
    "Use NODE_ENV=test and TEST_DATABASE_URL with isolated database studio_test",
  );
await migrate(url);
await migrate(url);
const test = Bun.spawn([process.execPath, "scripts/test.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
process.exit(await test.exited);
