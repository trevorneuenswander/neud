import path from "path";
import type { AppPaths } from "./app-paths";
import {
  assertDataEngineModuleExists,
  resolveDataEngineDistModule,
} from "./bag-detail-adapter-path";
import { nativeImport } from "./import-esm-module";

export type PuppeteerLaunchApi = {
  launch: (options: unknown) => Promise<unknown>;
};

export type ResolvedPuppeteerModule = {
  puppeteer: PuppeteerLaunchApi;
  resolvedBrowser: unknown;
  buildPuppeteerLaunchOptions: (
    resolvedBrowser: unknown,
    launchOptions?: Record<string, unknown>,
  ) => Record<string, unknown>;
};

type LegacyPuppeteerResolver = {
  importPuppeteerFromDir: (fromDir: string) => Promise<{
    module: unknown;
    packageJsonPath: string;
    packageVersion: string;
  }>;
  resolvePuppeteerBrowser: (options?: Record<string, unknown>) => Promise<unknown>;
  buildPuppeteerLaunchOptions: (
    resolvedBrowser: unknown,
    launchOptions?: Record<string, unknown>,
  ) => Record<string, unknown>;
  getPuppeteerApi: (puppeteerModule: unknown) => PuppeteerLaunchApi | null;
};

export async function resolvePuppeteerModule(
  paths: AppPaths,
  workerRoot: string,
): Promise<ResolvedPuppeteerModule> {
  const resolverPath = resolveDataEngineDistModule(
    paths,
    path.join("adapters", "legacy-puppeteer-resolver.js"),
  );
  assertDataEngineModuleExists(resolverPath);

  const resolver = await nativeImport<LegacyPuppeteerResolver>(resolverPath.moduleUrl);
  const imported = await resolver.importPuppeteerFromDir(workerRoot);
  const resolvedBrowser = await resolver.resolvePuppeteerBrowser({
    puppeteerModule: imported.module,
    puppeteerPackagePath: imported.packageJsonPath,
    puppeteerPackageVersion: imported.packageVersion,
  });

  const puppeteer = resolver.getPuppeteerApi(imported.module);
  if (!puppeteer || typeof puppeteer.launch !== "function") {
    throw new Error("Unable to resolve Puppeteer launch API.");
  }

  return {
    puppeteer,
    resolvedBrowser,
    buildPuppeteerLaunchOptions: resolver.buildPuppeteerLaunchOptions,
  };
}
