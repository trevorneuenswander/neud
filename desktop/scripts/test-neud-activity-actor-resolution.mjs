#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  ACTIVITY_UNKNOWN_USER_LABEL,
  isAutomatedActivityEventType,
  resolveActivityActorLabel,
} from "../../scripts/live-validation/lib/activity-actor-resolution.mjs";

test("automated online publish events resolve to System", () => {
  assert.equal(isAutomatedActivityEventType("display.online_published"), true);
  assert.equal(
    resolveActivityActorLabel({
      actorDisplayName: "Trevor Neuenswander",
      actorId: "user-123",
      eventType: "display.online_published",
    }),
    ACTIVITY_SYSTEM_ACTOR_LABEL,
  );
});

test("user events with user_id never resolve to System", () => {
  assert.equal(
    resolveActivityActorLabel({
      actorDisplayName: "System",
      actorId: "user-123",
      eventType: "display.order_changed",
    }),
    ACTIVITY_UNKNOWN_USER_LABEL,
  );
  assert.equal(
    resolveActivityActorLabel({
      actorDisplayName: null,
      profileName: "Trevor Neuenswander",
      actorId: "user-123",
      eventType: "display.order_changed",
    }),
    "Trevor Neuenswander",
  );
});

test("actor resolution order prefers stored name, then profile, then unknown user", () => {
  assert.equal(
    resolveActivityActorLabel({
      actorDisplayName: "Stored Name",
      profileName: "Profile Name",
      actorId: "user-123",
      eventType: "display.enabled",
    }),
    "Stored Name",
  );
  assert.equal(
    resolveActivityActorLabel({
      actorDisplayName: null,
      profileName: "Profile Name",
      actorId: "user-123",
      eventType: "display.enabled",
    }),
    "Profile Name",
  );
});
