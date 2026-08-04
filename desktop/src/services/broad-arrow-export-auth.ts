import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";
import type { CredentialStore } from "./credential-store";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import {
  BAG_DEFAULT_SCRAPER_SOURCES,
  BAG_LOGIN_CONFIG,
  BAG_AUCTION_SITE_ORIGIN,
} from "../bag/default-sources";
import {
  assertDataEngineModuleExists,
  resolveDataEngineDistModule,
} from "./bag-detail-adapter-path";
import { nativeImport } from "./import-esm-module";
import {
  BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE,
  getProjectWebpageScraperCredentials,
  MissingScraperCredentialsError,
} from "./project-scraper-auth";

export const BAG_EXPORT_LOGIN_FAILED_MESSAGE =
  "NEUD could not sign in to the auction website. Verify the saved Webpage Scraper credentials and try again.";

type PuppeteerPage = {
  url: () => string;
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
};

type PerformBagLogin = (input: {
  engineId: string;
  page: PuppeteerPage;
  sources: Array<{ source_key: string; url: string; enabled: boolean }>;
  cfg: { login: typeof BAG_LOGIN_CONFIG };
  runStep: (
    engineId: string,
    stage: string,
    action: () => Promise<unknown>,
    label: string,
  ) => Promise<unknown>;
  shareCookies: () => Promise<void>;
}) => Promise<{
  cookieStatus: string;
  authenticationStatus: string;
  currentSession: string;
}>;

function buildBagSourcesForLogin(
  dataSources: DataSourcesRepository,
  engineId: string,
): Array<{ source_key: string; url: string; enabled: boolean }> {
  return BAG_DEFAULT_SCRAPER_SOURCES.map((defaults) => {
    const configured = dataSources.getSourceByKey(engineId, defaults.sourceKey);
    return {
      source_key: defaults.sourceKey,
      url: configured?.url?.trim() || defaults.url,
      enabled: true,
    };
  });
}

export async function authenticateBroadArrowExportBrowser(input: {
  paths: AppPaths;
  engineId: string;
  page: PuppeteerPage;
  credentials: CredentialStore;
  dataSources: DataSourcesRepository;
}): Promise<{ authenticated: boolean; authenticatedOrigin: string }> {
  const creds = getProjectWebpageScraperCredentials(input.credentials, input.engineId);
  if (!creds?.email?.trim() || !creds.password) {
    throw new MissingScraperCredentialsError(BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE);
  }

  const browserUserDataDir = path.join(input.paths.browserData, input.engineId);
  fs.mkdirSync(browserUserDataDir, { recursive: true });
  fs.mkdirSync(input.paths.cookies, { recursive: true });

  process.env.NEUD_APP_DATA_DIR = input.paths.root;
  process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
  process.env.NEUD_COOKIES_DIR = input.paths.cookies;
  process.env.ENGINE_ID = input.engineId;
  process.env.BAG_AUCTION_EMAIL = creds.email.trim();
  process.env.BAG_AUCTION_PASSWORD = creds.password;

  const loginModulePath = resolveDataEngineDistModule(
    input.paths,
    path.join("bag-login-flow.js"),
  );
  assertDataEngineModuleExists(loginModulePath);
  const loginModule = await nativeImport<{ performBagLogin: PerformBagLogin }>(
    loginModulePath.moduleUrl,
  );

  const sources = buildBagSourcesForLogin(input.dataSources, input.engineId);
  const loginUrl =
    sources.find((source) => source.source_key === "login")?.url ??
    `${BAG_AUCTION_SITE_ORIGIN}/users/sign_in`;

  let result: Awaited<ReturnType<PerformBagLogin>>;
  try {
    result = await loginModule.performBagLogin({
      engineId: input.engineId,
      page: input.page,
      sources,
      cfg: { login: BAG_LOGIN_CONFIG },
      runStep: async (_engineId, _stage, action) => action(),
      shareCookies: async () => {},
    });
  } catch {
    throw new Error(BAG_EXPORT_LOGIN_FAILED_MESSAGE);
  }

  if (input.page.url().includes("/users/sign_in")) {
    throw new Error(BAG_EXPORT_LOGIN_FAILED_MESSAGE);
  }

  if (result.authenticationStatus !== "Authenticated") {
    throw new Error(BAG_EXPORT_LOGIN_FAILED_MESSAGE);
  }

  let authenticatedOrigin = BAG_AUCTION_SITE_ORIGIN;
  try {
    authenticatedOrigin = new URL(loginUrl).origin;
  } catch {
    // keep default origin
  }

  return { authenticated: true, authenticatedOrigin };
}
