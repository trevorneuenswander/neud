import fs from "fs";
import path from "path";
import { NEUD_APP_DATA_DIR } from "./neud-env.js";
import { isLocalApiEnabled, loadWorkerCredentials } from "./local-client.js";
import { getCookiesFile, loadCookies, saveCookies } from "./adapters/webpage-scraper/browser.js";
import { getSourceUrl } from "./settings.js";
import { StepError } from "./errors.js";
import {
  formatStageFailure,
  logBagDiagnostic,
  logBagDiagnosticError,
} from "./bag-diagnostics.js";

/** Legacy server.js v5.1 reference timeouts. */
const LEGACY_NAVIGATION_MS = 30000;
const LEGACY_SELECTOR_MS = 20000;
const LEGACY_TABLE_MS = 15000;

/** Legacy server.js v5.1 reference URLs (.env conventions). */
const LEGACY_REFERENCE_URLS = {
  auctionTable: "https://bagauction-jumbotron.auctionaccelerate.com/vehicles",
  login: "https://bagauction-jumbotron.auctionaccelerate.com/users/sign_in",
  auctionDisplay: "https://bagauction-jumbotron.auctionaccelerate.com/auctions",
};

/** Legacy server.js v5.1 selectors (must match exactly). */
const LEGACY_EMAIL_SELECTOR =
  'input[type="email"], #user_email, [name="user[email]"]';
const LEGACY_PASSWORD_SELECTOR =
  'input[type="password"], #user_password, [name="user[password]"]';
const LEGACY_SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';
const LEGACY_SUCCESS_SELECTOR = "#main-container table tbody";
const LEGACY_TABLE_SELECTOR = "#main-container table";
const LEGACY_FAILURE_SUBSTRING = "/users/sign_in";

function getLoginDiagnosticDir(engineId) {
  const root = NEUD_APP_DATA_DIR() || process.cwd();
  return path.join(root, "logs", "engines", "diagnostics", engineId);
}

function documentQuerySubmit(page) {
  return page.$(LEGACY_SUBMIT_SELECTOR);
}

async function populateLoginFieldsLegacy(page, email, password) {
  await page.evaluate(
    (emailValue, passwordValue, emailSelector, passwordSelector) => {
      const emailField = document.querySelector(emailSelector);
      const passwordField = document.querySelector(passwordSelector);

      if (emailField) {
        emailField.focus();
        emailField.value = "";
        emailField.dispatchEvent(new Event("input"));
        emailField.value = emailValue;
      }

      if (passwordField) {
        passwordField.focus();
        passwordField.value = "";
        passwordField.dispatchEvent(new Event("input"));
        passwordField.value = passwordValue;
      }
    },
    email,
    password,
    LEGACY_EMAIL_SELECTOR,
    LEGACY_PASSWORD_SELECTOR,
  );
}

async function waitForLegacyLoginSuccess(page) {
  await Promise.race([
    page.waitForSelector(LEGACY_SUCCESS_SELECTOR, { timeout: LEGACY_SELECTOR_MS }),
    page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: LEGACY_SELECTOR_MS })
      .catch(() => {}),
  ]);
}

async function readVisibleAuthError(page) {
  try {
    return await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        ".alert-danger, .flash.error, .error, [role='alert'], .invalid-feedback",
      );
      for (const node of candidates) {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text) return text.slice(0, 240);
      }
      return null;
    });
  } catch {
    return null;
  }
}

async function captureLoginFailureEvidence(page, engineId, stage, message, metadata = {}) {
  const dir = getLoginDiagnosticDir(engineId);
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = Date.now();
  const afterScreenshotPath = path.join(dir, `login-after-submit-${timestamp}.png`);

  try {
    await page.screenshot({ path: afterScreenshotPath, fullPage: true });
  } catch {
    // best-effort
  }

  const visibleError = await readVisibleAuthError(page);

  await logBagDiagnosticError(engineId, stage, message, {
    ...metadata,
    loginFailureScreenshot: afterScreenshotPath,
    loginPageUrl: page.url(),
    loginVisibleError: visibleError,
  });
}

async function loadBagCredentials(engineId) {
  let email = process.env.BAG_AUCTION_EMAIL?.trim() ?? "";
  let password = process.env.BAG_AUCTION_PASSWORD ?? "";

  if (isLocalApiEnabled()) {
    try {
      const fresh = await loadWorkerCredentials(engineId);
      if (fresh?.email) {
        email = fresh.email.trim();
      }
      if (fresh?.password) {
        password = fresh.password;
      }
    } catch {
      // fall back to process env for non-desktop runs
    }
  }

  if (!email || !password) {
    await logBagDiagnosticError(
      engineId,
      "credentials.missing",
      "Stage failed: loading secure credentials. Auction email or password is missing.",
    );
    throw new StepError(
      "credentials.missing",
      new Error("Auction email or password is missing."),
    );
  }

  process.env.BAG_AUCTION_EMAIL = email;
  process.env.BAG_AUCTION_PASSWORD = password;

  await logBagDiagnostic(engineId, "credentials.load", "Loading secure credentials", {
    auctionEmailLoaded: true,
    auctionPasswordLoaded: true,
    auctionPasswordLength: password.length,
  });

  return { email, password };
}

async function logLegacyConfigComparison(engineId, sources, passwordLength) {
  const loginUrl = getSourceUrl(sources, "login");
  const vehiclesUrl = getSourceUrl(sources, "vehicles");
  const displayUrl = getSourceUrl(sources, "auction-display");

  await logBagDiagnostic(
    engineId,
    "legacy.config.compare",
    "Comparing worker config to legacy server.js reference",
    {
      loginUrlMatches: loginUrl === LEGACY_REFERENCE_URLS.login,
      auctionTableUrlMatches: vehiclesUrl === LEGACY_REFERENCE_URLS.auctionTable,
      auctionDisplayUrlMatches: displayUrl === LEGACY_REFERENCE_URLS.auctionDisplay,
      emailLoaded: true,
      passwordLoaded: true,
      passwordLengthMatches: passwordLength > 0,
    },
  );
}

/**
 * Legacy server.js v5.1 login() ported for the NEUD bag-auction worker.
 * Sequence, selectors, field population, waits, and cookie handling match the reference.
 */
export async function performBagLogin({
  engineId,
  page,
  sources,
  cfg,
  runStep,
  shareCookies,
}) {
  const { email, password } = await loadBagCredentials(engineId);
  const vehiclesUrl = getSourceUrl(sources, "vehicles");
  const loginUrl = getSourceUrl(sources, "login");
  const failureSubstring = cfg?.login?.failureUrlSubstring ?? LEGACY_FAILURE_SUBSTRING;
  const cookiesFile = getCookiesFile();
  const cookiesFound = fs.existsSync(cookiesFile);

  await logLegacyConfigComparison(engineId, sources, password.length);

  await logBagDiagnostic(engineId, "legacy.login.cookies_found", "Legacy login diagnostics", {
    cookiesFound,
  });

  const hadCookies = await runStep(
    engineId,
    "cookie.load",
    async () => loadCookies(page),
    "Restoring cookies",
  );

  await logBagDiagnostic(engineId, "legacy.login.cookies_loaded", "Legacy login diagnostics", {
    cookiesLoaded: hadCookies,
  });

  await runStep(
    engineId,
    "vehicles.navigation",
    async () => {
      await page.goto(vehiclesUrl, {
        waitUntil: "domcontentloaded",
        timeout: LEGACY_NAVIGATION_MS,
      });
    },
    "Navigating to Vehicles Listing",
  );

  const redirectedToLogin = page.url().includes(failureSubstring);
  await logBagDiagnostic(engineId, "legacy.login.redirected", "Legacy login diagnostics", {
    redirectedToLogin,
  });

  if (!redirectedToLogin && hadCookies) {
    await logBagDiagnostic(engineId, "session.restored", "Session restored", {
      cookieStatus: "Restored",
      currentSession: "Authenticated via saved cookies",
    });
    await logBagDiagnostic(engineId, "legacy.login.authentication_verified", "Legacy login diagnostics", {
      authenticationVerified: true,
      via: "existing cookies",
    });
    await shareCookies();
    return {
      cookieStatus: "Restored",
      authenticationStatus: "Authenticated",
      currentSession: "Authenticated via saved cookies",
    };
  }

  await logBagDiagnostic(engineId, "session.login_required", "Login required", {
    cookieStatus: hadCookies ? "Expired" : "Not found",
    currentSession: "Login form required",
  });

  await runStep(
    engineId,
    "login.navigation",
    async () => {
      await page.goto(loginUrl, {
        waitUntil: "networkidle2",
        timeout: LEGACY_NAVIGATION_MS,
      });
    },
    "Navigating to login page",
  );

  await logBagDiagnostic(engineId, "legacy.login.page_loaded", "Legacy login diagnostics", {
    loginPageLoaded: true,
  });

  let emailSelectorFound = false;
  let passwordSelectorFound = false;

  await runStep(
    engineId,
    "login.credentials.wait",
    async () => {
      await page.waitForSelector(LEGACY_EMAIL_SELECTOR, {
        timeout: LEGACY_SELECTOR_MS,
      });
      emailSelectorFound = true;
      await page.waitForSelector(LEGACY_PASSWORD_SELECTOR, {
        timeout: LEGACY_SELECTOR_MS,
      });
      passwordSelectorFound = true;
    },
    "Waiting for login form",
  );

  await logBagDiagnostic(engineId, "legacy.login.selectors", "Legacy login diagnostics", {
    emailSelectorFound,
    passwordSelectorFound,
  });

  const diagnosticDir = getLoginDiagnosticDir(engineId);
  fs.mkdirSync(diagnosticDir, { recursive: true });
  const evidenceStamp = Date.now();
  const beforeScreenshotPath = path.join(diagnosticDir, `login-before-submit-${evidenceStamp}.png`);
  const urlBeforeSubmit = page.url();

  try {
    await page.screenshot({ path: beforeScreenshotPath, fullPage: true });
  } catch {
    // best-effort
  }

  await runStep(
    engineId,
    "login.credentials",
    async () => {
      await populateLoginFieldsLegacy(page, email, password);
    },
    "Entering login credentials",
  );

  let submitClicked = false;
  let submitSelectorFound = false;

  await runStep(
    engineId,
    "login.submission",
    async () => {
      const submitBtn = await documentQuerySubmit(page);
      submitSelectorFound = Boolean(submitBtn);
      if (submitBtn) {
        await submitBtn.click();
        submitClicked = true;
      } else {
        await page.keyboard.press("Enter");
        submitClicked = true;
      }

      await waitForLegacyLoginSuccess(page);
    },
    "Submitting login form",
  );

  const urlAfterSubmit = page.url();
  let afterScreenshotPath = null;
  try {
    afterScreenshotPath = path.join(diagnosticDir, `login-after-submit-${evidenceStamp}.png`);
    await page.screenshot({ path: afterScreenshotPath, fullPage: true });
  } catch {
    afterScreenshotPath = null;
  }

  await logBagDiagnostic(engineId, "legacy.login.submit", "Legacy login diagnostics", {
    submitSelectorFound,
    submitClicked,
    urlBeforeSubmit,
    urlAfterSubmit,
    loginBeforeScreenshot: beforeScreenshotPath,
    loginAfterScreenshot: afterScreenshotPath,
  });

  if (page.url().includes(failureSubstring)) {
    const visibleError = await readVisibleAuthError(page);
    await captureLoginFailureEvidence(
      page,
      engineId,
      "login.verify",
      formatStageFailure(
        "login.verify",
        "The site remained on the login page after submission.",
      ),
      {
        urlBeforeSubmit,
        urlAfterSubmit,
        loginBeforeScreenshot: beforeScreenshotPath,
        loginAfterScreenshot: afterScreenshotPath,
        submitSelectorFound,
        submitClicked,
        loginVisibleError: visibleError,
      },
    );
    throw new StepError(
      "login.verify",
      new Error("Login failed. The site remained on the login page after submission."),
    );
  }

  await runStep(engineId, "cookie.save", async () => saveCookies(page), "Saving session cookies");

  await logBagDiagnostic(engineId, "legacy.login.cookies_saved", "Legacy login diagnostics", {
    cookiesSaved: true,
  });

  await runStep(
    engineId,
    "login.verify",
    async () => {
      await page.goto(vehiclesUrl, {
        waitUntil: "networkidle2",
        timeout: LEGACY_NAVIGATION_MS,
      });
      await page.waitForSelector(LEGACY_TABLE_SELECTOR, {
        timeout: LEGACY_TABLE_MS,
      });
    },
    "Verifying authenticated session",
  );

  await logBagDiagnostic(engineId, "legacy.login.auction_table", "Legacy login diagnostics", {
    auctionTableDetected: true,
  });

  await shareCookies();

  await logBagDiagnostic(engineId, "session.verified", "Authentication verified");
  await logBagDiagnostic(engineId, "legacy.login.authentication_verified", "Legacy login diagnostics", {
    authenticationVerified: true,
    via: "login form",
  });

  return {
    cookieStatus: "Saved",
    authenticationStatus: "Authenticated",
    currentSession: "Authenticated via login form",
  };
}

/** Exported for temporary legacy parity testing. */
export const legacyLoginReference = {
  LEGACY_NAVIGATION_MS,
  LEGACY_SELECTOR_MS,
  LEGACY_TABLE_MS,
  LEGACY_EMAIL_SELECTOR,
  LEGACY_PASSWORD_SELECTOR,
  LEGACY_SUBMIT_SELECTOR,
  LEGACY_SUCCESS_SELECTOR,
  LEGACY_TABLE_SELECTOR,
  LEGACY_FAILURE_SUBSTRING,
  LEGACY_REFERENCE_URLS,
  documentQuerySubmit,
  populateLoginFieldsLegacy,
  waitForLegacyLoginSuccess,
};
