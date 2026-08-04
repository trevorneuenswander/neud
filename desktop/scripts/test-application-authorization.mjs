import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApplicationRole,
  roleRank,
  ROLE_RANK,
} from "../dist/auth/application-roles.js";
import {
  canAssignRole,
  canAssignUserToProject,
  canCreateProject,
  canCreateUser,
  canDeleteProject,
  canDeleteUser,
  canInviteUser,
  canOperateProject,
  canViewProject,
  canManageApplication,
  canViewUserList,
  hasGlobalProjectAccess,
  isPlatformAdministrator,
} from "../dist/auth/platform-permissions.js";

const owner = { id: "owner-1", role: "owner" };
const admin = { id: "admin-1", role: "admin" };
const operator = { id: "operator-1", role: "operator" };
const viewer = { id: "viewer-1", role: "viewer" };
const ownerTwo = { id: "owner-2", role: "owner" };
const adminTwo = { id: "admin-2", role: "admin" };

test("role hierarchy ranks owner above admin above operator above viewer", () => {
  assert.ok(roleRank("owner") > roleRank("admin"));
  assert.ok(roleRank("admin") > roleRank("operator"));
  assert.ok(roleRank("operator") > roleRank("viewer"));
  assert.deepEqual(ROLE_RANK.viewer, 1);
});

test("unknown roles normalize to viewer without elevated capability", () => {
  assert.equal(normalizeApplicationRole("mystery"), "viewer");
  assert.equal(canCreateProject({ role: "mystery" }), false);
  assert.equal(canCreateUser({ role: "mystery" }), false);
});

test("legacy user role normalizes to operator without losing operational access", () => {
  assert.equal(normalizeApplicationRole("user"), "operator");
  assert.equal(canOperateProject({ role: "user" }), true);
  assert.equal(canCreateProject({ role: "user" }), false);
});

test("project creation allows owner and admin only", () => {
  assert.equal(canCreateProject(owner), true);
  assert.equal(canCreateProject(admin), true);
  assert.equal(canCreateProject(operator), false);
  assert.equal(canCreateProject(viewer), false);
});

test("project deletion allows owner and admin only", () => {
  assert.equal(canDeleteProject(owner), true);
  assert.equal(canDeleteProject(admin), true);
  assert.equal(canDeleteProject(operator), false);
  assert.equal(canDeleteProject(viewer), false);
});

test("user creation and invite are limited to owner and admin", () => {
  assert.equal(canCreateUser(owner), true);
  assert.equal(canCreateUser(admin), true);
  assert.equal(canInviteUser(owner), true);
  assert.equal(canInviteUser(admin), true);
  assert.equal(canCreateUser(operator), false);
  assert.equal(canCreateUser(viewer), false);
});

test("role assignment rules enforce owner/admin boundaries", () => {
  assert.equal(canAssignRole(owner, admin, "owner"), true);
  assert.equal(canAssignRole(owner, admin, "admin"), true);
  assert.equal(canAssignRole(admin, operator, "admin"), true);
  assert.equal(canAssignRole(admin, operator, "owner"), false);
  assert.equal(canAssignRole(operator, viewer, "viewer"), false);
  assert.equal(canAssignRole(viewer, viewer, "viewer"), false);
});

test("user deletion rules protect owners and admins from admin deletion", () => {
  assert.equal(canDeleteUser(owner, admin, { activeOwnerCount: 2 }), true);
  assert.equal(canDeleteUser(owner, operator, { activeOwnerCount: 2 }), true);
  assert.equal(canDeleteUser(owner, viewer, { activeOwnerCount: 2 }), true);
  assert.equal(canDeleteUser(admin, owner, { activeOwnerCount: 2 }), false);
  assert.equal(canDeleteUser(admin, adminTwo, { activeOwnerCount: 2 }), false);
  assert.equal(canDeleteUser(admin, operator, { activeOwnerCount: 2 }), true);
  assert.equal(canDeleteUser(admin, viewer, { activeOwnerCount: 2 }), true);
  assert.equal(canDeleteUser(operator, viewer, { activeOwnerCount: 2 }), false);
  assert.equal(canDeleteUser(viewer, viewer, { activeOwnerCount: 2 }), false);
});

test("final owner protection blocks owner deletion when only one owner remains", () => {
  assert.equal(canDeleteUser(owner, ownerTwo, { activeOwnerCount: 1 }), false);
  assert.equal(canDeleteUser(owner, ownerTwo, { activeOwnerCount: 2 }), true);
});

test("admin cannot promote themselves to owner", () => {
  assert.equal(canAssignRole(admin, admin, "owner"), false);
});

test("project assignment management is limited to owner and admin", () => {
  assert.equal(canAssignUserToProject(owner), true);
  assert.equal(canAssignUserToProject(admin), true);
  assert.equal(canAssignUserToProject(operator), false);
  assert.equal(canAssignUserToProject(viewer), false);
});

test("global project access is limited to owner and admin", () => {
  assert.equal(hasGlobalProjectAccess(owner), true);
  assert.equal(hasGlobalProjectAccess(admin), true);
  assert.equal(hasGlobalProjectAccess(operator), false);
  assert.equal(hasGlobalProjectAccess(viewer), false);
});

test("project visibility capability includes assigned roles but creation UI gates admin roles", () => {
  assert.equal(canViewProject(viewer), true);
  assert.equal(canViewProject(operator), true);
  assert.equal(canViewUserList(owner), true);
  assert.equal(canViewUserList(admin), true);
  assert.equal(canViewUserList(operator), false);
  assert.equal(isPlatformAdministrator(owner), true);
  assert.equal(isPlatformAdministrator(admin), true);
  assert.equal(isPlatformAdministrator({ role: "user" }), false);
});

test("owner retains admin-equivalent platform administration capability", () => {
  assert.equal(isPlatformAdministrator(owner), true);
  assert.equal(canManageApplication(owner), true);
  assert.equal(canCreateProject(owner), true);
});
