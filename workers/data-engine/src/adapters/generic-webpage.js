import {
  closeBrowser,
  configurePageTimeouts,
  getBrowserTimeouts,
  launchBrowser,
  loadCookies,
  saveCookies,
} from "./webpage-scraper/browser.js";
import { getNavigationTimeoutMs } from "../config.js";
import { getSourceUrl } from "../settings.js";
import { isProtocolTimeout, sanitizeError, StepError } from "../errors.js";

const ADAPTER_NAME = "generic-webpage";
const PAGE_SOURCE_KEY = "page";
const LOGIN_SOURCE_KEY = "login";
const VALID_EXTRACTIONS = new Set(["text", "html", "attribute"]);
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

async function runStep(name, operation) {
  const startedAt = Date.now();

  try {
    const result = await operation();
    console.log(`[generic] ${name} completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    console.error(`[generic] ${name} failed after ${Date.now() - startedAt}ms`, {
      message: sanitizeError(error),
      protocolTimeout: isProtocolTimeout(error),
    });
    throw new StepError(name, error);
  }
}

function parseGenericConfig(engineConfig) {
  const config = engineConfig && typeof engineConfig === "object" ? engineConfig : {};
  const loginRaw = config.login;
  const fieldsRaw = config.fields;

  const login =
    loginRaw && typeof loginRaw === "object" && !Array.isArray(loginRaw)
      ? loginRaw
      : null;

  const fields = Array.isArray(fieldsRaw) ? fieldsRaw : [];

  return { login, fields };
}

export function validateGenericScrapeConfig(bundle) {
  const adapter =
    typeof bundle.engine?.config?.adapter === "string"
      ? bundle.engine.config.adapter
      : null;

  if (adapter !== ADAPTER_NAME) {
    throw new Error(
      `Generic webpage adapter expected adapter "${ADAPTER_NAME}" but received "${adapter ?? "none"}".`,
    );
  }

  const pageUrl = getSourceUrl(bundle.sources ?? [], PAGE_SOURCE_KEY);
  if (!pageUrl?.trim()) {
    throw new Error(
      "Page URL is not configured. Add the webpage you want to scrape before starting the engine.",
    );
  }

  let parsedPageUrl;
  try {
    parsedPageUrl = new URL(pageUrl.trim());
    if (
      parsedPageUrl.protocol !== "http:" &&
      parsedPageUrl.protocol !== "https:" &&
      parsedPageUrl.protocol !== "file:"
    ) {
      throw new Error("Page URL must use http, https, or file.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Page URL must use")) {
      throw error;
    }
    throw new Error("Page URL is not a valid http or https URL.");
  }

  const { login, fields } = parseGenericConfig(bundle.engine.config);

  if (!fields.length) {
    throw new Error(
      "Add at least one extraction field before starting the engine.",
    );
  }

  const seenKeys = new Set();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const prefix = `Extraction field ${index + 1}`;

    if (!field || typeof field !== "object") {
      throw new Error(`${prefix} is invalid.`);
    }

    const key = typeof field.key === "string" ? field.key.trim() : "";
    if (!KEY_PATTERN.test(key)) {
      throw new Error(
        `${prefix} needs a valid key (lowercase letters, numbers, hyphens, underscores).`,
      );
    }

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate extraction field key "${key}".`);
    }
    seenKeys.add(key);

    const selector = typeof field.selector === "string" ? field.selector.trim() : "";
    if (!selector) {
      throw new Error(`${prefix} "${key}" is missing a CSS selector.`);
    }

    if (!VALID_EXTRACTIONS.has(field.extraction)) {
      throw new Error(`${prefix} "${key}" has an unsupported extraction type.`);
    }

    if (field.extraction === "attribute") {
      const attribute =
        typeof field.attribute === "string" ? field.attribute.trim() : "";
      if (!attribute) {
        throw new Error(
          `${prefix} "${key}" requires an attribute name for attribute extraction.`,
        );
      }
    }
  }

  const loginUrl = getSourceUrl(bundle.sources ?? [], LOGIN_SOURCE_KEY)?.trim();
  if (loginUrl) {
    try {
      const parsedLoginUrl = new URL(loginUrl);
      if (
        parsedLoginUrl.protocol !== "http:" &&
        parsedLoginUrl.protocol !== "https:"
      ) {
        throw new Error("Login URL must use http or https.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Login URL")) {
        throw error;
      }
      throw new Error("Login URL is not a valid http or https URL.");
    }

    if (!login) {
      throw new Error(
        "Login URL is configured but login selectors are missing. Add username, password, and submit selectors.",
      );
    }

    const usernameSelector =
      typeof login.usernameSelector === "string"
        ? login.usernameSelector.trim()
        : "";
    const passwordSelector =
      typeof login.passwordSelector === "string"
        ? login.passwordSelector.trim()
        : "";
    const submitSelector =
      typeof login.submitSelector === "string" ? login.submitSelector.trim() : "";

    if (!usernameSelector || !passwordSelector || !submitSelector) {
      throw new Error(
        "Login URL is configured but login selectors are incomplete. Provide username, password, and submit selectors.",
      );
    }

    const email = process.env.SCRAPER_EMAIL?.trim();
    const password = process.env.SCRAPER_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "Missing scraper credentials. Save credentials before running login.",
      );
    }
  }

  return {
    pageUrl: pageUrl.trim(),
    loginUrl: loginUrl || null,
    login,
    fields,
  };
}

async function extractField(page, field) {
  const selector = field.selector.trim();
  const extraction = field.extraction;

  try {
    const handle = await page.$(selector);
    if (!handle) {
      return {
        value: null,
        found: false,
        selector,
        extraction,
      };
    }

    const value = await page.evaluate(
      (element, mode, attributeName) => {
        if (!element) return null;
        if (mode === "text") {
          return (element.textContent ?? "").trim();
        }
        if (mode === "html") {
          return element.innerHTML ?? "";
        }
        if (mode === "attribute") {
          return element.getAttribute(attributeName);
        }
        return null;
      },
      handle,
      extraction,
      field.attribute?.trim() ?? "",
    );

    await handle.dispose();

    return {
      value: value === null || value === undefined ? null : String(value),
      found: true,
      selector,
      extraction,
    };
  } catch (error) {
    return {
      value: null,
      found: false,
      selector,
      extraction,
      error: sanitizeError(error),
    };
  }
}

async function performLogin(page, loginUrl, loginConfig) {
  const navigationTimeoutMs = getNavigationTimeoutMs();
  const email = process.env.SCRAPER_EMAIL?.trim();
  const password = process.env.SCRAPER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing scraper credentials. Save credentials before running login.",
    );
  }

  await runStep("login navigation", async () => {
    await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
  });

  await runStep("login form fill", async () => {
    await page.waitForSelector(loginConfig.usernameSelector, {
      timeout: navigationTimeoutMs,
    });
    await page.waitForSelector(loginConfig.passwordSelector, {
      timeout: navigationTimeoutMs,
    });

    await page.$eval(
      loginConfig.usernameSelector,
      (element, value) => {
        if (element instanceof HTMLInputElement) {
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      email,
    );

    await page.$eval(
      loginConfig.passwordSelector,
      (element, value) => {
        if (element instanceof HTMLInputElement) {
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      password,
    );
  });

  await runStep("login submit", async () => {
    await Promise.all([
      page
        .waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: navigationTimeoutMs,
        })
        .catch(() => null),
      page.click(loginConfig.submitSelector),
    ]);
  });

  const successSelector =
    typeof loginConfig.successSelector === "string"
      ? loginConfig.successSelector.trim()
      : "";
  const successUrlContains =
    typeof loginConfig.successUrlContains === "string"
      ? loginConfig.successUrlContains.trim()
      : "";

  if (successSelector) {
    await runStep("login success selector", async () => {
      await page.waitForSelector(successSelector, {
        timeout: navigationTimeoutMs,
      });
    });
  } else if (successUrlContains) {
    await runStep("login success url", async () => {
      const currentUrl = page.url();
      if (!currentUrl.includes(successUrlContains)) {
        throw new Error(
          `Login did not reach expected URL containing "${successUrlContains}".`,
        );
      }
    });
  }

  await runStep("login cookie save", async () => saveCookies(page));
}

export function createGenericWebpageAdapter() {
  let browser = null;
  let page = null;
  let loggedIn = false;

  async function resetBrowser() {
    await closeBrowser(browser);
    browser = null;
    page = null;
    loggedIn = false;
  }

  async function ensureBrowser(headless) {
    if (browser && page) return;

    await runStep("browser launch", async () => {
      browser = await launchBrowser(headless);
      page = await browser.newPage();
      configurePageTimeouts(page);
    });
  }

  async function scrapeOnce(bundle) {
    const validated = validateGenericScrapeConfig(bundle);
    const navigationTimeoutMs = getNavigationTimeoutMs();

    await runStep("cookie load", async () => loadCookies(page));

    if (validated.loginUrl && validated.login && !loggedIn) {
      await performLogin(page, validated.loginUrl, validated.login);
      loggedIn = true;
    }

    await runStep("page navigation", async () => {
      await page.goto(validated.pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeoutMs,
      });
    });

    const title = await page.title().catch(() => undefined);
    const finalUrl = page.url();
    const values = {};

    for (const field of validated.fields) {
      values[field.key.trim()] = await extractField(page, field);
    }

    return {
      schemaVersion: 1,
      adapter: ADAPTER_NAME,
      sourceUrl: validated.pageUrl,
      capturedAt: new Date().toISOString(),
      page: {
        title: title || undefined,
        finalUrl,
      },
      values,
    };
  }

  return {
    async start({ settings, sources, engine }) {
      validateGenericScrapeConfig({ engine, settings, sources });
      await ensureBrowser(settings?.headless ?? true);
    },
    async stop() {
      await resetBrowser();
    },
    async restart(ctx) {
      await resetBrowser();
      await this.start(ctx);
    },
    async recoverBrowser() {
      await resetBrowser();
    },
    getBrowserTimeouts,
    scrapeOnce,
  };
}
