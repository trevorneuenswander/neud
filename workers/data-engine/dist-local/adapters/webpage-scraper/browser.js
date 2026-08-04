import puppeteer from "puppeteer";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getNavigationTimeoutMs,
  getPageTimeoutMs,
  getProtocolTimeoutMs,
} from "../../config.js";
import {
  NEUD_APP_DATA_DIR,
  NEUD_BROWSER_USER_DATA_DIR,
  NEUD_COOKIES_DIR,
} from "../../neud-env.js";

export function getBrowserTimeouts() {
  return {
    protocolTimeoutMs: getProtocolTimeoutMs(),
    pageTimeoutMs: getPageTimeoutMs(),
    navigationTimeoutMs: getNavigationTimeoutMs(),
  };
}

export function configurePageTimeouts(page) {
  const { pageTimeoutMs, navigationTimeoutMs } = getBrowserTimeouts();
  page.setDefaultTimeout(pageTimeoutMs);
  page.setDefaultNavigationTimeout(navigationTimeoutMs);
}

export function resolveBrowserUserDataDir() {
  const engineId = process.env.ENGINE_ID || "default";
  const explicit = NEUD_BROWSER_USER_DATA_DIR();
  if (explicit) return explicit;

  const appDataDir = NEUD_APP_DATA_DIR();
  if (appDataDir) {
    return path.join(appDataDir, "browser-data", engineId);
  }

  return null;
}

function candidateSystemChromePaths() {
  if (process.platform !== "win32") {
    return [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
  }

  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";

  return [
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData
      ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    path.join(programFiles, "Chromium", "Application", "chrome.exe"),
    path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
}

export function resolveChromeExecutable() {
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  for (const candidate of candidateSystemChromePaths()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const managed = puppeteer.executablePath();
    if (managed && fs.existsSync(managed)) {
      return managed;
    }
  } catch {
    // Puppeteer managed Chrome is unavailable.
  }

  return null;
}

function chromeMissingError() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || "(default Puppeteer cache)";
  return new Error(
    [
      "Could not find a Chrome/Chromium executable for the scraper.",
      "Install Google Chrome, set CHROME_EXECUTABLE_PATH, or run:",
      "  npx puppeteer browsers install chrome",
      `from workers/data-engine (Puppeteer cache: ${cacheDir}).`,
    ].join(" "),
  );
}

export async function launchBrowser(headless) {
  const { protocolTimeoutMs } = getBrowserTimeouts();
  const userDataDir = resolveBrowserUserDataDir();
  const chromeExecutable = resolveChromeExecutable();

  if (!chromeExecutable) {
    throw chromeMissingError();
  }

  const launchOptions = {
    headless,
    protocolTimeout: protocolTimeoutMs,
    executablePath: chromeExecutable,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
    defaultViewport: { width: 1366, height: 900 },
  };

  if (userDataDir) {
    fs.mkdirSync(userDataDir, { recursive: true });
    launchOptions.userDataDir = userDataDir;
  }

  return puppeteer.launch(launchOptions);
}

export async function createPages(browser) {
  const page = await browser.newPage();
  const detailPage = await browser.newPage();
  const auctionPage = await browser.newPage();
  configurePageTimeouts(page);
  configurePageTimeouts(detailPage);
  configurePageTimeouts(auctionPage);
  return { page, detailPage, auctionPage };
}

export function getCookiesFile() {
  const cookiesDir = NEUD_COOKIES_DIR();
  const engineId = process.env.ENGINE_ID || "default";

  if (cookiesDir) {
    return path.join(cookiesDir, `${engineId}.json`);
  }

  return path.join(process.cwd(), "cookies.json");
}

export async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(getCookiesFile(), JSON.stringify(cookies, null, 2));
  } catch {}
}

export async function loadCookies(page) {
  const file = getCookiesFile();
  if (!fs.existsSync(file)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const cookie of cookies) await page.setCookie(cookie);
    return true;
  } catch {
    return false;
  }
}

export async function clearStoredCookies(page) {
  const file = getCookiesFile();
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch {
      // best-effort file cleanup
    }
  }

  try {
    const cookies = await page.cookies();
    if (cookies.length) {
      await page.deleteCookie(...cookies);
    }
  } catch {
    // best-effort browser cookie cleanup
  }
}

export async function closeBrowser(browser) {
  if (!browser) return;

  try {
    await browser.close();
  } catch {
    try {
      const process = browser.process?.();
      if (process && !process.killed) {
        process.kill("SIGKILL");
      }
    } catch {}
  }
}
