#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCESS_PHOTO_MATRIX_RPC_SPECS,
  inputArgumentNames,
  matchRpcSpec,
  matchesExpectedArgumentNames,
  verifyAccessPhotoMatrixRpcs,
  verifyRpcSpec,
} from "./lib/rpc-schema-probe.mjs";

function mockClient(overloadsByName) {
  return {
    query: async (_sql, params) => ({
      rows: overloadsByName[params[0]] ?? [],
    }),
  };
}

test("zero-argument RPC is detected from pg_proc rows", async () => {
  const client = mockClient({
    get_access_management_directory: [
      {
        proname: "get_access_management_directory",
        identity_arguments: "",
        proargnames: null,
        pronargs: 0,
        pronargdefaults: 0,
      },
    ],
  });

  const probe = await verifyRpcSpec(client, {
    name: "get_access_management_directory",
    expectedArgumentNames: [],
  });

  assert.equal(probe.ok, true);
  assert.equal(probe.code, "ok");
});

test("required-argument RPC is detected without invoking PostgREST", async () => {
  const client = mockClient({
    create_team: [
      {
        proname: "create_team",
        identity_arguments: "p_name text, p_description text",
        proargnames: ["p_name", "p_description"],
        pronargs: 2,
        pronargdefaults: 1,
      },
    ],
  });

  const probe = await verifyRpcSpec(client, {
    name: "create_team",
    expectedArgumentNames: ["p_name", "p_description"],
  });

  assert.equal(probe.ok, true);
  assert.equal(probe.code, "ok");
  assert.deepEqual(probe.argumentNames, ["p_name", "p_description"]);
});

test("default-argument RPC is detected when optional parameters are present", async () => {
  const client = mockClient({
    update_team: [
      {
        proname: "update_team",
        identity_arguments: "p_team_id uuid, p_name text, p_description text, p_is_active boolean",
        proargnames: ["p_team_id", "p_name", "p_description", "p_is_active"],
        pronargs: 4,
        pronargdefaults: 3,
      },
    ],
  });

  const probe = await verifyRpcSpec(client, {
    name: "update_team",
    expectedArgumentNames: ["p_team_id", "p_name", "p_description", "p_is_active"],
  });

  assert.equal(probe.ok, true);
  assert.equal(probe.code, "ok");
});

test("missing RPC reports migration_missing", () => {
  const probe = matchRpcSpec([], {
    name: "create_team",
    expectedArgumentNames: ["p_name", "p_description"],
  });

  assert.equal(probe.ok, false);
  assert.equal(probe.code, "migration_missing");
});

test("wrong signature reports signature_mismatch", () => {
  const probe = matchRpcSpec(
    [
      {
        proname: "create_team",
        identity_arguments: "p_name text",
        proargnames: ["p_name"],
        pronargs: 1,
        pronargdefaults: 0,
      },
    ],
    {
      name: "create_team",
      expectedArgumentNames: ["p_name", "p_description"],
    },
  );

  assert.equal(probe.ok, false);
  assert.equal(probe.code, "signature_mismatch");
});

test("schema probe failures report schema_probe_failed", async () => {
  const client = {
    query: async () => {
      throw new Error("connection refused");
    },
  };

  const probe = await verifyRpcSpec(client, {
    name: "create_team",
    expectedArgumentNames: ["p_name", "p_description"],
  });

  assert.equal(probe.ok, false);
  assert.equal(probe.code, "schema_probe_failed");
});

test("create_team is not falsely reported missing when overload matches", () => {
  const probe = matchRpcSpec(
    [
      {
        proname: "create_team",
        identity_arguments: "p_name text, p_description text",
        proargnames: ["p_name", "p_description"],
        pronargs: 2,
        pronargdefaults: 1,
      },
    ],
    ACCESS_PHOTO_MATRIX_RPC_SPECS.find((spec) => spec.name === "create_team"),
  );

  assert.equal(probe.ok, true);
  assert.notEqual(probe.code, "migration_missing");
});

test("all 16 access/photo matrix RPC specifications are recognized", async () => {
  const overloadsByName = Object.fromEntries(
    ACCESS_PHOTO_MATRIX_RPC_SPECS.map((spec) => [
      spec.name,
      [
        {
          proname: spec.name,
          identity_arguments: spec.expectedArgumentNames.join(", "),
          proargnames: [...spec.expectedArgumentNames],
          pronargs: spec.expectedArgumentNames.length,
          pronargdefaults: 0,
        },
      ],
    ]),
  );

  const results = await verifyAccessPhotoMatrixRpcs(mockClient(overloadsByName));
  assert.equal(results.length, 16);
  assert.ok(results.every((entry) => entry.ok === true));
});

test("probe helper does not invoke mutation RPCs through PostgREST", () => {
  const matrixSource = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "run-access-photo-matrix.mjs"),
    "utf8",
  );
  const probeSource = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "lib", "rpc-schema-probe.mjs"),
    "utf8",
  );

  assert.doesNotMatch(probeSource, /admin\.rpc|createClient/);
  assert.match(matrixSource, /verifyAccessPhotoMatrixRpcs/);
  assert.match(matrixSource, /createLiveValidationDbClient/);
});

test("argument-name matcher accepts ordered prefixes with defaults", () => {
  assert.equal(
    matchesExpectedArgumentNames(["p_team_id", "p_name", "p_description", "p_is_active"], [
      "p_team_id",
      "p_name",
    ]),
    true,
  );
  assert.equal(inputArgumentNames({ proargnames: ["p_name", "p_description"], pronargs: 2 }).length, 2);
});
