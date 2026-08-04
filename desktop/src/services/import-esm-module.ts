/**
 * Load an ESM module by URL without TypeScript rewriting dynamic import to require().
 * Required for importing file:// worker adapters from the CommonJS desktop build.
 */
export async function nativeImport<T>(moduleUrl: string): Promise<T> {
  const importFn = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<T>;
  return importFn(moduleUrl);
}
