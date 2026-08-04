/**
 * Direct port of auction-ticker-BACKUP/server.js v5.1 Broad Arrow runtime.
 * This module is the single active login/scrape implementation for bag-auction.
 */
import fs from "fs";
import path from "path";
import {
  compareRuntimeInfo,
  readBrowserRuntimeInfo,
} from "./legacy-puppeteer-resolver.js";
import { NEUD_APP_DATA_DIR } from "../neud-env.js";
import {
  buildPuppeteerLaunchOptions,
  formatBrowserDiagnostics,
  isUsableExecutable,
  resolvePuppeteerBrowser,
} from "../browser/resolve-puppeteer-browser.js";
import { fetchLotDetailData } from "./bag-lot-detail-page.js";

export const LEGACY_RUNTIME_VERSION = "legacy-v5.1-direct-port";

const LEGACY_PAGE_TIMEOUT_MS = 30000;
const LEGACY_SELECTOR_MS = 20000;
const LEGACY_TABLE_MS = 15000;
const LEGACY_SUBMIT_CLICK_TIMEOUT_MS = 25000;

function absUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function documentQuerySubmit(page) {
  return page.$('button[type="submit"], input[type="submit"]');
}

function sanitizeOuterHtml(outerHTML) {
  return String(outerHTML ?? "")
    .replace(/value="[^"]*"/gi, 'value="[redacted]"')
    .replace(/value='[^']*'/gi, "value='[redacted]'")
    .slice(0, 500);
}

async function inspectSubmitElement(page) {
  return page.evaluate(() => {
    const element = document.querySelector('button[type="submit"], input[type="submit"]');
    if (!element) return null;
    const clone = element.cloneNode(true);
    if (clone instanceof HTMLInputElement) {
      clone.value = "[redacted]";
    }
    return {
      tagName: element.tagName,
      type: element.getAttribute("type"),
      outerHTML: clone.outerHTML,
      visible: !!(
        element.offsetWidth ||
        element.offsetHeight ||
        element.getClientRects().length
      ),
      enabled: !element.disabled,
      connected: element.isConnected,
    };
  }).then((result) =>
    result
      ? {
          ...result,
          outerHTML: sanitizeOuterHtml(result.outerHTML),
        }
      : null,
  );
}

function attachLoginSubmitListeners(page, sink) {
  const onFrameNavigated = (frame) => {
    if (frame === page.mainFrame()) {
      sink.events.push({ type: "framenavigated", url: frame.url() });
    }
  };
  const onRequest = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      sink.events.push({
        type: "request",
        url: request.url(),
        method: request.method(),
      });
    }
  };
  const onResponse = (response) => {
    const request = response.request();
    if (request.isNavigationRequest()) {
      sink.events.push({
        type: "response",
        url: response.url(),
        status: response.status(),
      });
    }
  };
  const onConsole = (message) => {
    sink.events.push({ type: "console", text: message.text().slice(0, 200) });
  };
  const onPageError = (error) => {
    sink.events.push({
      type: "pageerror",
      text: error instanceof Error ? error.message : String(error).slice(0, 200),
    });
  };

  page.on("framenavigated", onFrameNavigated);
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  return () => {
    page.off("framenavigated", onFrameNavigated);
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  };
}

function isNavigationDuringClickError(error) {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Node is detached from document") ||
    message.includes("Cannot find context with specified id")
  );
}

async function performLegacySubmit(page, submitButton, options = {}) {
  const { screenshotOnTimeoutPath = null } = options;
  const submitDiagnostics = {
    events: [],
    urlBeforeSubmit: page.url(),
    urlAfterSubmit: null,
    submitSelectorFound: Boolean(submitButton),
    submitClicked: false,
    submitClickStartedAt: null,
    submitClickCompletedAt: null,
    submitClickDurationMs: null,
    navigationStarted: false,
    submitCompatibilityFallbackUsed: false,
    submitClickTimedOut: false,
    submitTimeoutScreenshotPath: null,
    loginRouteRemaining: null,
  };

  submitDiagnostics.submitElement = await inspectSubmitElement(page);
  const detachListeners = attachLoginSubmitListeners(page, submitDiagnostics);

  const markNavigationStarted = () => {
    submitDiagnostics.navigationStarted = true;
  };
  page.on("framenavigated", markNavigationStarted);

  try {
    submitDiagnostics.submitClickStartedAt = new Date().toISOString();

    if (submitButton) {
      try {
        await Promise.race([
          (async () => {
            await submitButton.click();
            submitDiagnostics.submitClicked = true;
          })(),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `Submit click timed out after ${LEGACY_SUBMIT_CLICK_TIMEOUT_MS}ms.`,
                ),
              );
            }, LEGACY_SUBMIT_CLICK_TIMEOUT_MS);
          }),
        ]);
      } catch (clickError) {
        if (submitDiagnostics.navigationStarted || isNavigationDuringClickError(clickError)) {
          submitDiagnostics.navigationStarted = true;
          submitDiagnostics.submitClicked = true;
        } else {
          submitDiagnostics.submitClickTimedOut =
            clickError instanceof Error &&
            clickError.message.includes("Submit click timed out");

          if (submitDiagnostics.submitClickTimedOut && screenshotOnTimeoutPath) {
            submitDiagnostics.submitTimeoutScreenshotPath = screenshotOnTimeoutPath;
            await page
              .screenshot({ path: screenshotOnTimeoutPath, fullPage: true })
              .catch(() => {});
          }

          if (!submitDiagnostics.navigationStarted) {
            const currentUrl = page.url();
            if (!currentUrl.includes("/users/sign_in")) {
              submitDiagnostics.navigationStarted = true;
              submitDiagnostics.submitClicked = true;
            } else {
            submitDiagnostics.submitCompatibilityFallbackUsed = true;
            try {
              await submitButton.evaluate((button) => {
                if (typeof button.click === "function") {
                  button.click();
                  return;
                }

                const form = button.closest("form");
                if (form?.requestSubmit) {
                  form.requestSubmit(button);
                } else if (form) {
                  form.submit();
                }
              });
              submitDiagnostics.submitClicked = true;
            } catch (fallbackError) {
              if (
                submitDiagnostics.navigationStarted ||
                isNavigationDuringClickError(fallbackError)
              ) {
                submitDiagnostics.navigationStarted = true;
                submitDiagnostics.submitClicked = true;
              } else {
                throw fallbackError;
              }
            }
            }
          } else {
            throw clickError;
          }
        }
      }
    } else {
      await page.keyboard.press("Enter");
      submitDiagnostics.submitClicked = true;
    }

    submitDiagnostics.submitClickCompletedAt = new Date().toISOString();
    submitDiagnostics.submitClickDurationMs =
      Date.parse(submitDiagnostics.submitClickCompletedAt) -
      Date.parse(submitDiagnostics.submitClickStartedAt);
  } finally {
    page.off("framenavigated", markNavigationStarted);
    detachListeners();
  }

  submitDiagnostics.urlAfterSubmit = page.url();
  submitDiagnostics.loginRouteRemaining = page.url().includes("/users/sign_in");
  return submitDiagnostics;
}

export function createBagAuctionLegacyRuntime(options) {
  const {
    engineId = "",
    config,
    puppeteer: puppeteerModule,
    runtimeInfo = {},
    referenceRuntimeInfo = null,
    logStage = async () => {},
    logStageError = async () => {},
  } = options;

  if (!puppeteerModule) {
    throw new Error("Broad Arrow legacy runtime requires an injected Puppeteer module.");
  }

  const puppeteer = puppeteerModule.default ?? puppeteerModule;

  const {
    AUCTION_URL,
    LOGIN_URL,
    AUCTIONS_DISPLAY_URL,
    AUCTION_EMAIL,
    AUCTION_PASSWORD,
    DETAILS_TTL_MS = 300000,
    MAX_DETAIL_CHECKS_PER_POLL = 8,
    COOKIES_FILE,
    HEADLESS = true,
  } = config;

  let browser;
  let page;
  let detailPage;
  let auctionPage;

  let cache = {
    prev: null,
    current: null,
    next: [],
    lots: [],
    lastSold: null,
    auctionDisplay: null,
    updatedAt: null,
  };

  const detailsCache = new Map();
  let booted = false;
  let stopping = false;
  let authInfo = {
    cookieStatus: "Unknown",
    authenticationStatus: "Unknown",
    currentSession: "Unknown",
  };
  let lastScrapeStats = null;
  let runtimeMatchInfo = {
    ...runtimeInfo,
    headless: HEADLESS !== false && String(HEADLESS) !== "false",
    launchArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
    legacyPuppeteerPackageMatch: runtimeInfo.legacyPuppeteerPackageMatch ?? null,
    legacyBrowserExecutableMatch: runtimeInfo.legacyBrowserExecutableMatch ?? null,
    legacyBrowserVersionMatch: runtimeInfo.legacyBrowserVersionMatch ?? null,
  };
  let loginSubmitDiagnostics = null;

  function diagnosticDir() {
    const root = NEUD_APP_DATA_DIR() || process.cwd();
    return path.join(root, "logs", "engines", "diagnostics", engineId || "default");
  }

  async function saveCookies(p) {
    try {
      const cookies = await p.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log("[auth] cookies saved");
    } catch (error) {
      console.warn(
        "[auth] save cookies failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function loadCookies(p) {
    if (!fs.existsSync(COOKIES_FILE)) return false;
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
      for (const cookie of cookies) {
        await p.setCookie(cookie);
      }
      console.log("[auth] cookies loaded");
      return true;
    } catch (error) {
      console.warn(
        "[auth] load cookies failed:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  async function shareCookiesToOtherPages() {
    try {
      const cookies = await page.cookies();
      if (cookies?.length) {
        if (detailPage) await detailPage.setCookie(...cookies);
        if (auctionPage) await auctionPage.setCookie(...cookies);
      }
    } catch {
      // legacy server swallows share errors
    }
  }

  async function login() {
    await logStage("legacy.login.cookies", "Loading cookies");
    const hadCookies = await loadCookies(page);

    await logStage("legacy.login.auction_table", "Navigating to Auction Table URL");
    await page.goto(AUCTION_URL, {
      waitUntil: "domcontentloaded",
      timeout: LEGACY_PAGE_TIMEOUT_MS,
    });

    if (!page.url().includes("/users/sign_in") && hadCookies) {
      console.log("[auth] using existing session");
      authInfo = {
        cookieStatus: "Restored",
        authenticationStatus: "Authenticated",
        currentSession: "Authenticated via saved cookies",
      };
      await logStage("legacy.login.authentication_complete", "Authentication complete");
      await shareCookiesToOtherPages();
      return;
    }

    await logStage("legacy.login.login_url", "Navigating to Login URL");
    await page.goto(LOGIN_URL, {
      waitUntil: "networkidle2",
      timeout: LEGACY_PAGE_TIMEOUT_MS,
    });

    await logStage("legacy.login.email_selector", "Waiting for email selector");
    await page.waitForSelector(
      'input[type="email"], #user_email, [name="user[email]"]',
      { timeout: LEGACY_SELECTOR_MS },
    );

    await logStage("legacy.login.password_selector", "Waiting for password selector");
    await page.waitForSelector(
      'input[type="password"], #user_password, [name="user[password]"]',
      { timeout: LEGACY_SELECTOR_MS },
    );

    await logStage("legacy.login.assign_values", "Assigning login values");
    await page.evaluate(
      (email, pwd) => {
        const emailInput = document.querySelector(
          'input[type="email"], #user_email, [name="user[email]"]',
        );
        const passwordInput = document.querySelector(
          'input[type="password"], #user_password, [name="user[password]"]',
        );

        if (emailInput) {
          emailInput.focus();
          emailInput.value = "";
          emailInput.dispatchEvent(new Event("input"));
          emailInput.value = email;
        }

        if (passwordInput) {
          passwordInput.focus();
          passwordInput.value = "";
          passwordInput.dispatchEvent(new Event("input"));
          passwordInput.value = pwd;
        }
      },
      AUCTION_EMAIL,
      AUCTION_PASSWORD,
    );

    const populatedLengths = await page.evaluate(() => {
      const emailInput = document.querySelector(
        'input[type="email"], #user_email, [name="user[email]"]',
      );
      const passwordInput = document.querySelector(
        'input[type="password"], #user_password, [name="user[password]"]',
      );
      return {
        emailLength: emailInput?.value?.length ?? 0,
        passwordLength: passwordInput?.value?.length ?? 0,
      };
    });

    await logStage("legacy.login.assign_values", "Assigning login values", {
      emailFieldPopulated: populatedLengths.emailLength > 0,
      passwordFieldPopulated: populatedLengths.passwordLength > 0,
      passwordCharacterCount: populatedLengths.passwordLength,
    });

    if (!populatedLengths.emailLength || !populatedLengths.passwordLength) {
      throw new Error("Login fields were not populated after legacy assignment.");
    }

    const urlBeforeSubmit = page.url();
    fs.mkdirSync(diagnosticDir(), { recursive: true });
    const evidenceStamp = Date.now();
    const beforeScreenshotPath = path.join(
      diagnosticDir(),
      `login-before-submit-${evidenceStamp}.png`,
    );
    await page.screenshot({ path: beforeScreenshotPath, fullPage: true }).catch(() => {});

    await logStage("legacy.login.submit", "Submitting login form");
    const submitButton = await documentQuerySubmit(page);
    const submitTimeoutScreenshotPath = path.join(
      diagnosticDir(),
      `login-submit-timeout-${evidenceStamp}.png`,
    );
    loginSubmitDiagnostics = await performLegacySubmit(page, submitButton, {
      screenshotOnTimeoutPath: submitTimeoutScreenshotPath,
    });
    await logStage("legacy.login.submit", "Submitting login form", {
      submitSelectorFound: loginSubmitDiagnostics.submitSelectorFound,
      submitClicked: loginSubmitDiagnostics.submitClicked,
      submitClickDurationMs: loginSubmitDiagnostics.submitClickDurationMs,
      navigationStarted: loginSubmitDiagnostics.navigationStarted,
      submitCompatibilityFallbackUsed: loginSubmitDiagnostics.submitCompatibilityFallbackUsed,
      submitClickTimedOut: loginSubmitDiagnostics.submitClickTimedOut,
      submitTimeoutScreenshotPath: loginSubmitDiagnostics.submitTimeoutScreenshotPath,
      urlBeforeSubmit: loginSubmitDiagnostics.urlBeforeSubmit,
      urlAfterSubmit: loginSubmitDiagnostics.urlAfterSubmit,
      submitElementTagName: loginSubmitDiagnostics.submitElement?.tagName ?? null,
      submitElementType: loginSubmitDiagnostics.submitElement?.type ?? null,
      submitElementVisible: loginSubmitDiagnostics.submitElement?.visible ?? null,
      submitElementEnabled: loginSubmitDiagnostics.submitElement?.enabled ?? null,
      submitElementConnected: loginSubmitDiagnostics.submitElement?.connected ?? null,
    });

    await logStage("legacy.login.wait_result", "Waiting for post-login result");
    await Promise.race([
      page.waitForSelector("#main-container table tbody", {
        timeout: LEGACY_SELECTOR_MS,
      }),
      page
        .waitForNavigation({ waitUntil: "networkidle2", timeout: LEGACY_SELECTOR_MS })
        .catch(() => {}),
    ]);

    const urlAfterSubmit = page.url();
    const afterScreenshotPath = path.join(
      diagnosticDir(),
      `login-after-submit-${evidenceStamp}.png`,
    );
    await page.screenshot({ path: afterScreenshotPath, fullPage: true }).catch(() => {});

    if (page.url().includes("/users/sign_in")) {
      const loginFailureScreenshotPath = path.join(
        diagnosticDir(),
        `login-failed-${evidenceStamp}.png`,
      );
      await page
        .screenshot({ path: loginFailureScreenshotPath, fullPage: true })
        .catch(() => {});

      let visibleError = null;
      try {
        visibleError = await page.evaluate(() => {
          const candidates = document.querySelectorAll(
            ".alert-danger, .flash.error, .error, [role='alert']",
          );
          for (const node of candidates) {
            const text = node.textContent?.replace(/\s+/g, " ").trim();
            if (text) return text.slice(0, 240);
          }
          return null;
        });
      } catch {
        visibleError = null;
      }

      await logStageError("legacy.login.failed", new Error("Login failed."), {
        urlBeforeSubmit,
        urlAfterSubmit,
        submitControlFound: Boolean(submitButton),
        submitClicked: loginSubmitDiagnostics?.submitClicked ?? false,
        navigationOccurred: urlAfterSubmit !== urlBeforeSubmit,
        navigationStarted: loginSubmitDiagnostics?.navigationStarted ?? false,
        submitCompatibilityFallbackUsed:
          loginSubmitDiagnostics?.submitCompatibilityFallbackUsed ?? false,
        remainedOnLoginRoute: true,
        loginVisibleError: visibleError,
        loginBeforeScreenshot: beforeScreenshotPath,
        loginAfterScreenshot: afterScreenshotPath,
        loginFailureScreenshot: loginFailureScreenshotPath,
        submitElement: loginSubmitDiagnostics?.submitElement ?? null,
        submitEvents: loginSubmitDiagnostics?.events?.slice(-10) ?? [],
      });

      throw new Error(
        "Login failed. Check the configured credentials and legacy selectors.",
      );
    }

    await logStage("legacy.login.save_cookies", "Saving cookies");
    await saveCookies(page);

    await logStage("legacy.login.return_auction_table", "Returning to Auction Table URL");
    await page.goto(AUCTION_URL, {
      waitUntil: "networkidle2",
      timeout: LEGACY_PAGE_TIMEOUT_MS,
    });

    await shareCookiesToOtherPages();
    authInfo = {
      cookieStatus: "Saved",
      authenticationStatus: "Authenticated",
      currentSession: "Authenticated via login form",
    };
    await logStage("legacy.login.authentication_complete", "Authentication complete");
  }

  async function fetchVehicleDetails(editUrl) {
    if (!editUrl) return null;

    const ttl = Number(DETAILS_TTL_MS);
    const cached = detailsCache.get(editUrl);
    if (cached && Date.now() - cached.checkedAt < ttl) return cached;

    const details = await fetchLotDetailData(detailPage, editUrl, {
      timeout: LEGACY_PAGE_TIMEOUT_MS,
      login,
    });

    const record = { ...details, checkedAt: Date.now() };
    detailsCache.set(editUrl, record);
    return record;
  }

  async function scrapeAuctionDisplayPage() {
    try {
      await auctionPage.goto(AUCTIONS_DISPLAY_URL, {
        waitUntil: "networkidle2",
        timeout: LEGACY_PAGE_TIMEOUT_MS,
      });

      if (auctionPage.url().includes("/users/sign_in")) {
        await login();
        await auctionPage.goto(AUCTIONS_DISPLAY_URL, {
          waitUntil: "networkidle2",
          timeout: LEGACY_PAGE_TIMEOUT_MS,
        });
      }

      await auctionPage.waitForSelector("#vehicle-content", { timeout: LEGACY_TABLE_MS });

      const data = await auctionPage.evaluate(() => {
        const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

        const lot = clean(document.querySelector(".lot-number .value")?.textContent);

        const year = clean(
          document.querySelector('.vehicle-name [data-bind="year"], .vehicle-name .Year')
            ?.textContent,
        );

        const title = clean(
          document.querySelector('.vehicle-name [data-bind="title"]')?.textContent,
        );

        const biddingPrice = clean(document.querySelector(".current_price")?.textContent);

        const reserveStatus =
          clean(document.querySelector("#js-no-reserve.visible")?.textContent) ||
          clean(document.querySelector("#js-reserved-sm.visible")?.textContent) ||
          "";

        const currencies = Array.from(
          document.querySelectorAll(".other-currency .price"),
        ).map((el) => clean(el.textContent));

        const photos = Array.from(document.querySelectorAll("#images img"))
          .map((img) => img.src)
          .filter(Boolean);

        return {
          lot: lot ? `Lot ${lot}` : "",
          year,
          title,
          biddingPrice,
          reserveStatus,
          currencies,
          photos,
          scrapedAt: new Date().toISOString(),
        };
      });

      console.log(
        `[auctionDisplay] ${data.lot} | ${data.year || "—"} ${data.title || ""} | ${data.biddingPrice} | ${data.reserveStatus} | ${data.photos.length} imgs`,
      );

      return data;
    } catch (error) {
      console.warn(
        "[auctionDisplay] error:",
        error instanceof Error ? error.message : String(error),
      );
      return cache.auctionDisplay || null;
    }
  }

  async function scrape() {
    if (stopping) {
      return cache;
    }

    const pollStartedAt = Date.now();
    let tablePageDurationMs = 0;
    let displayPageDurationMs = 0;
    let detailChecksAttempted = 0;
    let detailChecksSucceeded = 0;
    let lastSoldDetailChecks = 0;

    try {
      await logStage("legacy.scrape.listing", "Starting listing scrape");
      if (stopping) return cache;

      const tableStartedAt = Date.now();
      await page.reload({ waitUntil: "networkidle2", timeout: LEGACY_PAGE_TIMEOUT_MS });
      if (stopping) return cache;
      await page.waitForSelector("#main-container table", { timeout: LEGACY_TABLE_MS });
      tablePageDurationMs = Date.now() - tableStartedAt;

      const data = await page.evaluate(() => {
        const table = document.querySelector("#main-container table");
        if (!table) return { lots: [], activeIndex: -1 };

        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const lots = rows
          .map((tr) => {
            const tds = tr.querySelectorAll("td");
            const statusLabel = tds[4]?.querySelector(".label");
            const status = statusLabel ? (statusLabel.textContent || "").trim() : null;

            const editA = tr.querySelector('td a.btn[href^="/vehicles/"][href$="/edit"]');
            const editHref = editA?.getAttribute("href") || null;

            return {
              lot: tds[0]?.textContent.trim() || null,
              title: tds[1]?.textContent.trim() || null,
              price: tds[2]?.textContent.trim() || "",
              status,
              editHref,
            };
          })
          .filter((r) => r.lot);

        const activeIndex = lots.findIndex((r) => r.status && /active/i.test(r.status));
        return { lots, activeIndex };
      });

      if (!data.lots.length) {
        console.log("[scrape] no rows found (table missing or selectors changed)");
        lastScrapeStats = {
          listingRowCount: 0,
          auctionTableFound: true,
          loginRouteRemaining: page.url().includes("/users/sign_in"),
          auctionDisplayFound: false,
        };
        return cache;
      }

      let prev = null;
      let current = null;
      let next = [];

      if (data.activeIndex >= 0) {
        current = data.lots[data.activeIndex] || null;
        prev = data.lots[data.activeIndex - 1] || null;
        next = data.lots.slice(data.activeIndex + 1, data.activeIndex + 4);
      } else {
        prev = data.lots[0] || null;
        next = data.lots.slice(1, 4);
        current = null;
      }

      let lastSold = null;

      const scanLots =
        data.activeIndex >= 0
          ? data.lots.slice(0, data.activeIndex).reverse()
          : [...data.lots].reverse();

      const maxLastSoldChecks = Math.max(1, Number(MAX_DETAIL_CHECKS_PER_POLL));
      const lastSoldTtl = Number(DETAILS_TTL_MS);
      const lastSoldNow = Date.now();

      for (const lotRow of scanLots) {
        if (lastSoldDetailChecks >= maxLastSoldChecks || stopping) break;
        const u = absUrl(lotRow.editHref, AUCTION_URL);
        if (!u) continue;
        const cached = detailsCache.get(u);
        if (cached && lastSoldNow - cached.checkedAt <= lastSoldTtl) continue;
        lastSoldDetailChecks += 1;
        detailChecksAttempted += 1;
        try {
          await fetchVehicleDetails(u);
          detailChecksSucceeded += 1;
        } catch {
          // legacy continues lastSold detail checks silently
        }
      }

      for (const lotRow of scanLots) {
        const u = absUrl(lotRow.editHref, AUCTION_URL);
        const d = u ? detailsCache.get(u) : null;
        if (d?.sold) {
          lastSold = {
            lot: lotRow.lot,
            title: lotRow.title,
            price: d.currentPrice
              ? `$ ${Number(d.currentPrice).toLocaleString()}`
              : lotRow.price,
            editUrl: u,
          };
          break;
        }
      }

      if (stopping) {
        return cache;
      }

      await logStage("legacy.scrape.auction_display", "Starting auction display scrape");
      const displayStartedAt = Date.now();
      const auctionDisplay = stopping ? cache.auctionDisplay || null : await scrapeAuctionDisplayPage();
      displayPageDurationMs = Date.now() - displayStartedAt;

      const totalPollDurationMs = Date.now() - pollStartedAt;
      const snapshotDurationMs = Math.max(
        0,
        totalPollDurationMs - tablePageDurationMs - displayPageDurationMs,
      );

      cache = {
        prev,
        current,
        next,
        lots: data.lots,
        lastSold,
        auctionDisplay,
        sourceUrl: AUCTION_URL,
        listingUrl: AUCTION_URL,
        updatedAt: new Date().toISOString(),
      };

      lastScrapeStats = {
        listingRowCount: data.lots.length,
        auctionTableFound: true,
        loginRouteRemaining: page.url().includes("/users/sign_in"),
        auctionDisplayFound: Boolean(auctionDisplay),
        detailChecksAttempted,
        detailChecksSucceeded,
        activeIndex: data.activeIndex,
        currentLot: current?.lot ?? null,
        previousLot: prev?.lot ?? null,
        nextLots: next.map((lot) => lot.lot).filter(Boolean),
        lastSoldLot: lastSold?.lot ?? null,
        pollTiming: {
          displayPageDurationMs,
          tablePageDurationMs,
          snapshotDurationMs,
          totalPollDurationMs,
          detailPagesVisited: lastSoldDetailChecks,
          photosDownloaded: 0,
        },
      };

      const logPrev = prev ? `${prev.lot} ${prev.price || ""}` : "—";
      const logCurr = current ? `${current.lot} (Active)` : "—";
      const logNext = next.map((n) => n.lot).join(", ") || "—";
      const logLast = lastSold ? `${lastSold.lot} ${lastSold.price || ""}` : "—";
      const logAuction = auctionDisplay
        ? `${auctionDisplay.lot || "—"} ${auctionDisplay.year || ""} ${auctionDisplay.title || ""} ${auctionDisplay.biddingPrice || ""}`
        : "—";

      console.log(
        `[scrape] rows:${data.lots.length} prev:${logPrev} current:${logCurr} next:${logNext} lastSold:${logLast} auctionDisplay:${logAuction}`,
      );

      await logStage("legacy.scrape.listing_complete", "Listing scrape complete");
      return cache;
    } catch (error) {
      console.warn(
        "[scrape] error:",
        error instanceof Error ? error.message : String(error),
      );
      if (page?.url && page.url().includes("/users/sign_in")) {
        try {
          await login();
        } catch (reloginError) {
          console.warn(
            "[relogin] failed:",
            reloginError instanceof Error ? reloginError.message : String(reloginError),
          );
        }
      }
      return cache;
    }
  }

  async function boot() {
    await logStage("legacy.boot.start", "Starting legacy Broad Arrow runtime", {
      broadArrowRuntimeVersion: LEGACY_RUNTIME_VERSION,
    });

    await logStage("legacy.boot.launch", "Launching Puppeteer");
    const resolvedBrowser = await resolvePuppeteerBrowser({
      puppeteerModule: puppeteer,
      puppeteerPackagePath: runtimeMatchInfo.puppeteerPackagePath ?? null,
      puppeteerPackageVersion: runtimeMatchInfo.puppeteerPackageVersion ?? null,
      configuredExecutablePath: runtimeMatchInfo.browserExecutable ?? null,
    });

    const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
      headless: runtimeMatchInfo.headless,
      args: runtimeMatchInfo.launchArgs,
      defaultViewport: { width: 1366, height: 900 },
    });


    await logStage("legacy.boot.launch", "Resolved Puppeteer browser", {
      ...formatBrowserDiagnostics(resolvedBrowser.diagnostics),
    });

    browser = await puppeteer.launch(launchOptions);
    runtimeMatchInfo = {
      ...runtimeMatchInfo,
      browserExecutable: resolvedBrowser.executablePath ?? null,
      browserSource: resolvedBrowser.source ?? null,
      browserDiagnostics: formatBrowserDiagnostics({
        ...resolvedBrowser.diagnostics,
        browserLaunchSucceeded: true,
      }),
    };
    runtimeMatchInfo = await readBrowserRuntimeInfo(browser, runtimeMatchInfo);
    if (referenceRuntimeInfo) {
      runtimeMatchInfo = {
        ...runtimeMatchInfo,
        ...compareRuntimeInfo(referenceRuntimeInfo, runtimeMatchInfo),
      };
    }
    runtimeMatchInfo = {
      ...runtimeMatchInfo,
      browserDiagnostics: formatBrowserDiagnostics({
        ...(runtimeMatchInfo.browserDiagnostics ?? {}),
        browserLaunchSucceeded: true,
        browserVersion: runtimeMatchInfo.browserVersion ?? null,
        resolvedExecutableExists: isUsableExecutable(runtimeMatchInfo.browserExecutable)
          ? "yes"
          : "no",
      }),
    };
    await logStage("legacy.boot.launch", "Launching Puppeteer", {
      puppeteerPackagePath: runtimeMatchInfo.puppeteerPackagePath ?? null,
      puppeteerPackageVersion: runtimeMatchInfo.puppeteerPackageVersion ?? null,
      browserExecutable: runtimeMatchInfo.browserExecutable ?? null,
      browserSource: runtimeMatchInfo.browserSource ?? null,
      browserProcessExecutable: runtimeMatchInfo.browserProcessExecutable ?? null,
      browserVersion: runtimeMatchInfo.browserVersion ?? null,
      resolvedExecutableExists: isUsableExecutable(runtimeMatchInfo.browserExecutable)
        ? "yes"
        : "no",
      browserLaunchSucceeded: "yes",
      legacyPuppeteerPackageMatch: runtimeMatchInfo.legacyPuppeteerPackageMatch ?? null,
      legacyBrowserExecutableMatch: runtimeMatchInfo.legacyBrowserExecutableMatch ?? null,
      legacyBrowserVersionMatch: runtimeMatchInfo.legacyBrowserVersionMatch ?? null,
      ...(runtimeMatchInfo.browserDiagnostics ?? {}),
    });

    await logStage("legacy.boot.listing_page", "Creating listing page");
    page = await browser.newPage();
    page.setDefaultTimeout(LEGACY_PAGE_TIMEOUT_MS);

    await logStage("legacy.boot.detail_page", "Creating detail page");
    detailPage = await browser.newPage();
    detailPage.setDefaultTimeout(LEGACY_PAGE_TIMEOUT_MS);

    await logStage("legacy.boot.auction_page", "Creating auction display page");
    auctionPage = await browser.newPage();
    auctionPage.setDefaultTimeout(LEGACY_PAGE_TIMEOUT_MS);

    await login();
    booted = true;
  }

  async function stop() {
    if (stopping && !browser) {
      return;
    }

    stopping = true;

    try {
      if (browser) await browser.close();
    } catch {
      // legacy cleanup swallows close errors
    }
    browser = undefined;
    page = undefined;
    detailPage = undefined;
    auctionPage = undefined;
    booted = false;
  }

  function isStopping() {
    return stopping;
  }

  return {
    version: LEGACY_RUNTIME_VERSION,
    async start() {
      if (!booted) {
        stopping = false;
        await boot();
      }
    },
    async scrapeOnce() {
      if (stopping) {
        return cache;
      }
      if (!booted) {
        stopping = false;
        await boot();
      }
      return scrape();
    },
    getCache() {
      return cache;
    },
    getAuthInfo() {
      return authInfo;
    },
    getLastScrapeStats() {
      return lastScrapeStats;
    },
    getRuntimeMatchInfo() {
      return runtimeMatchInfo;
    },
    getLoginSubmitDiagnostics() {
      return loginSubmitDiagnostics;
    },
    stop,
    isStopping,
    login,
    scrape,
    async exportLotDetails(tasks, options = {}) {
      if (!browser) {
        throw new Error("The auction browser session is unavailable.");
      }

      const shouldAbort =
        typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;

      const { fetchLotDetailData } = await import("./bag-lot-detail-page.js");
      const { resolveExportEditUrl, resolveAuctionOrigin, summarizeEditUrlSamples } = await import(
        "./bag-edit-url-resolution.js"
      );
      const { downloadLotPhotos, PHOTO_DOWNLOADER_MODULE } = await import(
        "./bag-photo-download.js"
      );

      const exportAbortStateAtStart = shouldAbort();
      const tempPage = await browser.newPage();
      tempPage.setDefaultTimeout(LEGACY_PAGE_TIMEOUT_MS);

      const detailsByLot = {};
      const failed = [];
      const lotDiagnostics = [];
      const lotFailures = [];
      const photoDownloads = {
        attempted: 0,
        succeeded: 0,
        failed: [],
        diagnostics: [],
      };

      let attempted = 0;
      let succeeded = 0;
      let lotsQueued = tasks.length;
      let detailNavigationsStarted = 0;
      let detailNavigationsSucceeded = 0;
      let detailPagesAuthenticated = 0;
      let detailPagesParsed = 0;
      let detailResultsMerged = 0;
      let detailPagesVisited = 0;
      let photoUrlsFound = 0;
      let photoFilesWritten = 0;
      let reserveValuesResolved = 0;
      let reserveValuesUnknown = 0;
      let lotsWithSourceEditHref = 0;
      let lotsWithResolvedEditUrl = 0;
      const sampleSourceEditUrls = [];
      const sampleResolvedEditUrls = [];
      let sessionCookieNames = [];

      const recordLotFailure = (failure) => {
        if (lotFailures.length < 25) {
          lotFailures.push(failure);
        }
      };

      try {
        if (!booted) {
          stopping = false;
          await boot();
        }

        await tempPage.goto(AUCTION_URL, {
          waitUntil: "domcontentloaded",
          timeout: LEGACY_PAGE_TIMEOUT_MS,
        });
        if (tempPage.url().includes("/users/sign_in")) {
          await login();
          await tempPage.goto(AUCTION_URL, {
            waitUntil: "domcontentloaded",
            timeout: LEGACY_PAGE_TIMEOUT_MS,
          });
        }

        sessionCookieNames = await tempPage
          .cookies()
          .then((cookies) => cookies.map((cookie) => cookie.name).filter(Boolean))
          .catch(() => []);

        for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
          if (shouldAbort()) {
            break;
          }

          const task = tasks[taskIndex];
          attempted += 1;
          const sourceEditUrl = task.sourceEditUrl ?? task.editUrl ?? null;
          const resolvedEditUrl = sourceEditUrl
            ? resolveExportEditUrl(sourceEditUrl, AUCTION_URL)
            : null;

          if (sourceEditUrl) {
            lotsWithSourceEditHref += 1;
            if (sampleSourceEditUrls.length < 3) {
              sampleSourceEditUrls.push(sourceEditUrl);
            }
          }
          if (resolvedEditUrl) {
            lotsWithResolvedEditUrl += 1;
            if (sampleResolvedEditUrls.length < 3) {
              sampleResolvedEditUrls.push(resolvedEditUrl);
            }
          }

          const lotDiagnostic = {
            lotId: task.lotNumber,
            lotNumber: task.lotNumber,
            detailUrlPresent: Boolean(resolvedEditUrl),
            detailNavigationStarted: false,
            detailNavigationStatus: "pending",
            photoSelectorMatches: 0,
            photoContainerFound: false,
            photoUrlsExtracted: 0,
            photoDownloadAttempts: 0,
            photoFilesWritten: 0,
            reserveSelectorMatched: false,
            reserveRawValue: null,
            reserveNormalizedValue: null,
            failureStage: null,
            failureMessage: null,
          };

          if (typeof options.onLotProgress === "function") {
            options.onLotProgress({
              phase: "processing-lot",
              current: taskIndex + 1,
              total: tasks.length,
              lotNumber: task.lotNumber,
            });
          }

          if (!resolvedEditUrl) {
            lotDiagnostic.detailNavigationStatus = "skipped";
            lotDiagnostic.failureStage = "url-resolution";
            lotDiagnostic.failureMessage = "Lot detail URL could not be resolved.";
            lotDiagnostic.reserveNormalizedValue = "unknown";
            reserveValuesUnknown += 1;
            recordLotFailure({
              lotId: task.lotNumber,
              lotNumber: task.lotNumber,
              sourceEditUrl,
              resolvedEditUrl: null,
              stage: "url-resolution",
              navigationStatus: null,
              finalUrl: null,
              pageTitle: null,
              loginPageDetected: false,
              message: lotDiagnostic.failureMessage,
            });
            failed.push({
              lot: task.lotNumber,
              editUrl: sourceEditUrl ?? "",
              reason: lotDiagnostic.failureMessage,
            });
            lotDiagnostics.push(lotDiagnostic);
            continue;
          }

          detailPagesVisited += 1;
          detailNavigationsStarted += 1;
          lotDiagnostic.detailNavigationStarted = true;

          try {
            const detail = await fetchLotDetailData(tempPage, resolvedEditUrl, {
              timeout: LEGACY_PAGE_TIMEOUT_MS,
              login,
              shouldAbort,
              auctionUrl: AUCTION_URL,
            });

            detailNavigationsSucceeded += 1;
            if (!detail.navigation?.loginPageDetected) {
              detailPagesAuthenticated += 1;
            }
            detailPagesParsed += 1;

            lotDiagnostic.detailNavigationStatus = "ok";
            lotDiagnostic.photoSelectorMatches =
              detail.diagnostics?.photoSelectorMatches ??
              detail.photoSelectorMatches ??
              detail.photoUrls.length;
            lotDiagnostic.photoUrlsExtracted =
              detail.diagnostics?.photoUrlsExtracted ?? detail.photoUrls.length;
            lotDiagnostic.reserveSelectorMatched = detail.reserveSelectorMatched === true;
            lotDiagnostic.reserveRawValue = detail.reserveRawText ?? null;
            lotDiagnostic.reserveNormalizedValue = detail.reserveStatus ?? "unknown";
            if (detail.diagnostics?.photoContainerFound) {
              lotDiagnostic.photoContainerFound = true;
            }
            if (detail.reserveStatus && detail.reserveStatus !== "unknown") {
              reserveValuesResolved += 1;
            } else {
              reserveValuesUnknown += 1;
            }

            photoUrlsFound += detail.photoUrls.length;
            detail.photoUrls = (
              await import("./bag-photo-url-normalize.js")
            ).dedupePhotoUrls(detail.photoUrls);
            detailsByLot[task.lotNumber] = detail;
            detailResultsMerged += 1;
            succeeded += 1;

            if (typeof options.onLotProgress === "function") {
              options.onLotProgress({
                phase: "processing-lot",
                current: taskIndex + 1,
                total: tasks.length,
                lotNumber: task.lotNumber,
                stage: "metadata-complete",
                photoCountDiscovered: detail.photoUrls.length,
              });
            }
          } catch (error) {
            const stage =
              error && typeof error === "object" && "stage" in error
                ? String(error.stage)
                : shouldAbort()
                  ? "cancelled"
                  : "unknown";
            const meta =
              error && typeof error === "object" && "meta" in error && error.meta
                ? error.meta
                : {};

            if (meta.navigationCompleted === true) {
              detailNavigationsSucceeded += 1;
            }
            if (meta.editFormFound === true || meta.pageKind?.editFormFound === true) {
              detailPagesAuthenticated += 1;
            }

            const reason = error instanceof Error ? error.message : "Lot detail processing failed.";

            lotDiagnostic.detailNavigationStatus = "failed";
            lotDiagnostic.failureStage = stage;
            lotDiagnostic.failureMessage = reason;
            lotDiagnostic.reserveNormalizedValue = "unknown";
            reserveValuesUnknown += 1;

            recordLotFailure({
              lotId: task.lotNumber,
              lotNumber: task.lotNumber,
              sourceEditUrl: meta.sourceEditUrl ?? sourceEditUrl,
              resolvedEditUrl: meta.resolvedEditUrl ?? resolvedEditUrl,
              stage,
              navigationStatus:
                typeof meta.navigationStatus === "number" ? meta.navigationStatus : null,
              finalUrl: typeof meta.finalUrl === "string" ? meta.finalUrl : null,
              pageTitle: typeof meta.pageTitle === "string" ? meta.pageTitle : null,
              loginPageDetected: meta.loginPageDetected === true,
              message: reason,
            });

            failed.push({
              lot: task.lotNumber,
              editUrl: resolvedEditUrl,
              reason,
            });

            if (stage === "cancelled" && shouldAbort()) {
              lotDiagnostics.push(lotDiagnostic);
              break;
            }
          }

          lotDiagnostics.push(lotDiagnostic);
          if (typeof options.onLotProgress === "function") {
            options.onLotProgress({
              phase: "processing-lot",
              current: taskIndex + 1,
              total: tasks.length,
              lotNumber: task.lotNumber,
              stage: "lot-complete",
            });
          }
        }

        if (options.photoDownloadRoot && !shouldAbort()) {
          const totalPhotos = Object.values(detailsByLot).reduce((sum, detail) => {
            const photoUrls = Array.isArray(detail.photoUrls) ? detail.photoUrls : [];
            return sum + photoUrls.length;
          }, 0);

          if (typeof options.onMetadataComplete === "function") {
            options.onMetadataComplete({
              totalLots: tasks.length,
              totalPhotos,
            });
          }

          let completedPhotos = 0;
          for (const [lotNumber, detail] of Object.entries(detailsByLot)) {
            if (shouldAbort()) {
              break;
            }

            const photoUrls = Array.isArray(detail.photoUrls) ? detail.photoUrls : [];
            if (photoUrls.length === 0) continue;

            photoDownloads.attempted += photoUrls.length;
            const lotDiagnostic = lotDiagnostics.find(
              (entryDiagnostic) => entryDiagnostic.lotNumber === lotNumber,
            );
            if (lotDiagnostic) {
              lotDiagnostic.photoDownloadAttempts = photoUrls.length;
            }

            try {
              const result = await downloadLotPhotos(
                tempPage,
                lotNumber,
                photoUrls,
                options.photoDownloadRoot,
                {
                  shouldAbort,
                  onPhotoProgress: (event) => {
                    if (event.terminal) {
                      completedPhotos += 1;
                    }
                    options.onPhotoProgress?.({
                      ...event,
                      totalPhotos,
                      completedPhotos,
                    });
                  },
                },
              );
              photoDownloads.succeeded += result.references.length;
              photoDownloads.failed.push(...result.failed);
              photoFilesWritten += result.references.length;
              if (Array.isArray(result.diagnostics)) {
                photoDownloads.diagnostics = [
                  ...(photoDownloads.diagnostics ?? []),
                  ...result.diagnostics,
                ];
              }
              detailsByLot[lotNumber].photos = result.references;
              if (lotDiagnostic) {
                lotDiagnostic.photoFilesWritten = result.references.length;
              }
            } catch (error) {
              const reason = error instanceof Error ? error.message : "Photo download failed.";
              photoDownloads.failed.push({
                lot: lotNumber,
                url: "",
                reason,
              });
              if (lotDiagnostic) {
                lotDiagnostic.failureStage = lotDiagnostic.failureStage ?? "photo-download";
                lotDiagnostic.failureMessage = reason;
              }
            }
          }
        }
      } finally {
        await tempPage.close().catch(() => {});
      }

      return {
        attempted,
        succeeded,
        failed,
        detailsByLot,
        photoDownloads,
        cancelled: shouldAbort(),
        comprehensiveDiagnostics: {
          lotsQueued,
          lotsWithSourceEditHref,
          lotsWithResolvedEditUrl,
          sampleSourceEditUrls: summarizeEditUrlSamples(sampleSourceEditUrls),
          sampleResolvedEditUrls: summarizeEditUrlSamples(sampleResolvedEditUrls),
          detailPagesQueued: tasks.length,
          detailNavigationsStarted,
          detailNavigationsSucceeded,
          detailPagesAuthenticated,
          detailPagesParsed,
          detailResultsMerged,
          detailPagesVisited,
          detailPagesSucceeded: succeeded,
          detailPagesFailed: failed.length,
          lotsWithPhotoUrls: Object.values(detailsByLot).filter(
            (detail) => Array.isArray(detail.photoUrls) && detail.photoUrls.length > 0,
          ).length,
          photoUrlsFound,
          photoRequestsStarted: photoDownloads.attempted,
          photoResponsesReceived: photoDownloads.succeeded,
          photoFilesWritten,
          reserveValuesResolved,
          reserveValuesUnknown,
          exportAbortStateAtStart,
          exportAbortStateAfterFailure: shouldAbort(),
          browserConnected: browser.isConnected?.() ?? true,
          authenticatedOrigin: resolveAuctionOrigin(AUCTION_URL),
          sessionCookieNames,
          photoDownloaderModule: PHOTO_DOWNLOADER_MODULE,
          lotDiagnostics,
          lotFailures,
        },
      };
    },
  };
}
