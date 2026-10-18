import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  commandDefinitions,
  registerCommands,
} from "../apps/core/src/discord.js";
import { IDS, DEPARTMENTS } from "@tfl/shared";
import type { Config } from "@tfl/config";
test("all four slash commands serialize and register only in the audited guild", async () => {
  const definitions = commandDefinitions();
  assert.deepEqual(definitions.map((x) => x.name).sort(), [
    "estado-bot",
    "inicio",
    "recopilar",
    "reporte",
  ]);
  const report = definitions.find((x) => x.name === "reporte")!;
  assert.deepEqual(
    report.options?.map((x) => x.name),
    ["departamento", "titulo", "descripcion", "proyecto"],
  );
  const department = report.options?.find((x) => x.name === "departamento");
  assert.ok(department && "choices" in department);
  assert.equal(department.choices?.length, Object.keys(DEPARTMENTS).length);
  let calls = 0;
  await registerCommands(
    {
      DISCORD_CLIENT_ID: "1559294093962510386",
      DISCORD_GUILD_ID: IDS.guild,
    } as Config,
    {
      put: async (route, options) => {
        calls++;
        assert.equal(
          route,
          "/applications/1559294093962510386/guilds/" + IDS.guild + "/commands",
        );
        assert.deepEqual(options?.body, definitions);
        return [];
      },
    },
  );
  assert.equal(calls, 1);
});
