#!/usr/bin/env node
/**
 * Runtime-oriented ordering test: simulates startup overlap that previously
 * produced an empty DisplaySync follow-up pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const STARTUP_COALESCE_SYNC_REASONS = new Set([
  "startup",
  "startup-restore",
  "deferred",
  "follow-up",
  "reconcile",
  "auth-recovered",
]);

function createStartupFollowUpModel() {
  let syncInProgress = false;
  let activeSyncReason = null;
  let syncFollowUpRequested = false;
  let syncFollowUpHadWork = false;
  let syncPassPendingBaseline = 0;
  let pendingQueueCount = 0;
  let remainingEligible = 0;
  const decisions = [];

  function getPendingQueueCount() {
    return pendingQueueCount;
  }

  function shouldRunFollowUpPass() {
    if (getPendingQueueCount() > 0) {
      return true;
    }
    if (remainingEligible > 0) {
      return true;
    }
    return false;
  }

  function recordFollowUpTrigger(source, reason) {
    syncFollowUpRequested = true;
    syncFollowUpHadWork = true;
    decisions.push({ source, reason, action: "flagged" });
  }

  function requestSync(reason) {
    if (!syncInProgress) {
      return "run_now";
    }
    if (
      activeSyncReason === "startup" &&
      reason === "mutation" &&
      getPendingQueueCount() <= syncPassPendingBaseline
    ) {
      decisions.push({ source: "requestSync", reason, action: "coalesced_mutation_baseline" });
      return "coalesced";
    }
    recordFollowUpTrigger("requestSync", reason);
    return "deferred";
  }

  function syncNow(reason) {
    if (syncInProgress) {
      if (
        STARTUP_COALESCE_SYNC_REASONS.has(reason) &&
        activeSyncReason &&
        STARTUP_COALESCE_SYNC_REASONS.has(activeSyncReason)
      ) {
        decisions.push({ source: "syncNow", reason, action: "coalesced_startup_overlap" });
        return "coalesced";
      }
      recordFollowUpTrigger("syncNow", reason);
      return "deferred";
    }

    syncInProgress = true;
    activeSyncReason = reason;
    syncFollowUpRequested = false;
    syncFollowUpHadWork = false;
    if (reason === "startup") {
      syncPassPendingBaseline = getPendingQueueCount();
    }

    return "active";
  }

  function completeActivePass(reason) {
    pendingQueueCount = 0;
    remainingEligible = 0;

    syncInProgress = false;
    activeSyncReason = null;

    let followUpRan = false;
    if (syncFollowUpRequested) {
      const runFollowUp = syncFollowUpHadWork && shouldRunFollowUpPass();
      decisions.push({
        source: "syncNow",
        reason,
        action: runFollowUp ? "follow_up_scheduled" : "follow_up_suppressed_no_eligible_work",
      });
      syncFollowUpRequested = false;
      syncFollowUpHadWork = false;
      if (runFollowUp) {
        followUpRan = true;
      }
    }
    return followUpRan ? "follow_up" : "completed";
  }

  function reconcileLocalDisplays(queueCount) {
    pendingQueueCount += queueCount;
    if (syncInProgress && activeSyncReason === "startup") {
      decisions.push({
        source: "reconcileLocalDisplays",
        reason: "reconcile",
        action: "defer_to_active_startup",
      });
      return;
    }
    syncNow("reconcile");
  }

  function runStartupScenario() {
    pendingQueueCount = 0;
    syncNow("startup");
    reconcileLocalDisplays(10);
    requestSync("mutation");
    syncNow("auth-recovered");
    return completeActivePass("startup");
  }

  return { decisions, runStartupScenario };
}

test("startup ordering suppresses empty follow-up after reconcile overlap", () => {
  const model = createStartupFollowUpModel();
  const outcome = model.runStartupScenario();
  assert.equal(outcome, "completed");
  assert.ok(
    model.decisions.some((entry) => entry.action === "defer_to_active_startup"),
    "expected reconcile to defer while startup is active",
  );
  assert.ok(
    model.decisions.some((entry) => entry.action === "coalesced_startup_overlap"),
    "expected auth-recovered overlap to coalesce with startup",
  );
  assert.doesNotMatch(
    model.decisions.map((entry) => entry.action).join("|"),
    /follow_up_scheduled/,
  );
});
