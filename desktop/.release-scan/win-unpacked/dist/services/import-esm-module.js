"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nativeImport = nativeImport;
/**
 * Load an ESM module by URL without TypeScript rewriting dynamic import to require().
 * Required for importing file:// worker adapters from the CommonJS desktop build.
 */
async function nativeImport(moduleUrl) {
    const importFn = new Function("url", "return import(url)");
    return importFn(moduleUrl);
}
