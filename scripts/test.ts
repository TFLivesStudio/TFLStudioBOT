import { readdir } from "node:fs/promises";
// Existing node:test subtests and global fetch stubs run in separate Bun processes.
// This preserves isolation and the full original assertions, including awaited t.test().
for (const file of (await readdir("tests"))
  .filter((f) => f.endsWith(".test.ts"))
  .sort()) {
  const child = Bun.spawn([process.execPath, "test", `tests/${file}`], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if ((await child.exited) !== 0) process.exit(1);
}
