import { writeLog } from "./logs.js";

const STAGE_LABELS = {
  "engine.start": "Starting engine",
  "credentials.load": "Loading secure credentials",
  "credentials.missing": "Loading secure credentials",
  "cookie.load": "Restoring cookies",
  "session.restored": "Session restored",
  "session.valid": "Existing session valid",
  "session.expired": "Existing session expired",
  "session.cookies_loaded": "Cookies loaded",
  "session.cookies_cleared": "Stale cookies cleared",
  "session.verified": "Authentication verified",
  "legacy.runtime.version": "Broad Arrow runtime marker",
  "legacy.config.loaded": "Legacy runtime configuration",
  "legacy.boot.start": "Starting legacy Broad Arrow runtime",
  "legacy.boot.launch": "Launching Puppeteer",
  "legacy.boot.listing_page": "Creating listing page",
  "legacy.boot.detail_page": "Creating detail page",
  "legacy.boot.auction_page": "Creating auction display page",
  "legacy.login.cookies": "Loading cookies",
  "legacy.login.auction_table": "Navigating to Auction Table URL",
  "legacy.login.login_url": "Navigating to Login URL",
  "legacy.login.email_selector": "Waiting for email selector",
  "legacy.login.password_selector": "Waiting for password selector",
  "legacy.login.assign_values": "Assigning login values",
  "legacy.login.submit": "Submitting login form",
  "legacy.login.wait_result": "Waiting for post-login result",
  "legacy.login.save_cookies": "Saving cookies",
  "legacy.login.return_auction_table": "Returning to Auction Table URL",
  "legacy.login.authentication_complete": "Authentication complete",
  "legacy.login.failed": "Login failed",
  "legacy.scrape.listing": "Starting listing scrape",
  "legacy.scrape.auction_display": "Starting auction display scrape",
  "legacy.scrape.listing_complete": "Listing scrape complete",
  "legacy.scrape.publish": "Publishing snapshot",
  "login.fresh": "Fresh login attempted",
  "session.login_required": "Session expired — login required",
  "login.navigation": "loading login page",
  "login.credentials.wait": "loading login page",
  "login.credentials": "entering login credentials",
  "login.form": "entering login credentials",
  "login.submission": "login submission",
  "login.verify": "verifying authenticated session",
  "login.failed": "Login failed",
  "vehicles.navigation": "Navigating to Vehicles Listing",
  "vehicles.loaded": "Listing page loaded",
  "vehicles.rows": "Listing rows parsed",
  "lots.active": "Active lot detected",
  "lots.previous": "Previous lot",
  "lots.next": "Next lots",
  "details.check": "Checking detail pages",
  "last_sold": "Last Sold",
  "auction_display.load": "Loading Auction Display page",
  "auction_display.complete": "Auction Display scraped",
  "auction_display.retained": "Auction Display retained from cache",
  "snapshot.write": "Snapshot written",
  "live_state.update": "Live state updated",
  "sse.publish": "SSE published",
  "pipeline.complete": "Completed successfully",
};

export function formatStageLabel(stage) {
  return STAGE_LABELS[stage] ?? stage;
}

export function formatStageFailure(step, message) {
  const label = formatStageLabel(step) || step || "Unknown stage";
  return `Stage failed: ${label}. ${message}`;
}

export async function logBagDiagnostic(engineId, stage, message, metadata = {}) {
  if (!engineId) return;

  try {
    await writeLog(engineId, "info", "bag.diagnostic", message, {
      stage,
      ...metadata,
    });
  } catch (error) {
    console.error("[bag-diagnostic] write failed:", error.message);
  }
}

export async function logBagDiagnosticError(
  engineId,
  stage,
  message,
  metadata = {},
) {
  if (!engineId) return;

  try {
    await writeLog(engineId, "error", "bag.diagnostic", message, {
      stage,
      failed: true,
      ...metadata,
    });
  } catch (error) {
    console.error("[bag-diagnostic] error write failed:", error.message);
  }
}
