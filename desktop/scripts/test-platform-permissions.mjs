import test from "node:test";
import assert from "node:assert/strict";
import {
  canCreateProject,
  canDeleteProject,
  isPlatformAdministrator,
} from "../dist/auth/platform-permissions.js";

test("platform permissions allow owner and admin project management", () => {
  assert.equal(canCreateProject({ role: "admin" }), true);
  assert.equal(canCreateProject({ role: "owner" }), true);
  assert.equal(canCreateProject({ role: "operator" }), false);
  assert.equal(canCreateProject({ role: "viewer" }), false);
  assert.equal(canCreateProject({ role: "user" }), false);

  assert.equal(canDeleteProject({ role: "admin" }), true);
  assert.equal(canDeleteProject({ role: "owner" }), true);
  assert.equal(canDeleteProject({ role: "operator" }), false);
  assert.equal(canDeleteProject({ role: "viewer" }), false);

  assert.equal(isPlatformAdministrator({ role: "owner" }), true);
  assert.equal(isPlatformAdministrator({ role: "admin" }), true);
  assert.equal(isPlatformAdministrator({ role: "operator" }), false);
  assert.equal(isPlatformAdministrator({ role: "user" }), false);
});
