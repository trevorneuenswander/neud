import type { EditableGraphicSchema } from "../packages/sema/editable-graphic-schema";

const SCHEMA_SCRIPT_RE =
  /<script\s+type=["']application\/json["']\s+id=["']neud-editable-schema["']\s*>[\s\S]*?<\/script>/i;
const ASSET_BASE_SCRIPT_RE =
  /<script\s+id=["']neud-editable-asset-base["']\s*>[\s\S]*?<\/script>/i;

/**
 * Injects the saved editable schema into the runtime HTML shell.
 * Escapes `<` in JSON so the script block cannot be broken out of.
 */
export function injectEditableGraphicSchema(
  html: string,
  schema: EditableGraphicSchema,
  options?: { assetBaseUrl?: string },
): string {
  const json = JSON.stringify(schema, null, 2).replace(/</g, "\\u003c");
  const block = `<script type="application/json" id="neud-editable-schema">\n${json}\n  </script>`;
  let next = SCHEMA_SCRIPT_RE.test(html)
    ? html.replace(SCHEMA_SCRIPT_RE, block)
    : html.includes("</body>")
      ? html.replace("</body>", `${block}\n</body>`)
      : `${html}\n${block}`;

  if (options?.assetBaseUrl) {
    const safeBase = String(options.assetBaseUrl).replace(/</g, "\\u003c").replace(/"/g, '\\"');
    const assetBlock = `<script id="neud-editable-asset-base">window.__NEUD_EDITABLE_ASSET_BASE__="${safeBase}";</script>`;
    next = ASSET_BASE_SCRIPT_RE.test(next)
      ? next.replace(ASSET_BASE_SCRIPT_RE, assetBlock)
      : next.includes("</body>")
        ? next.replace("</body>", `${assetBlock}\n</body>`)
        : `${next}\n${assetBlock}`;
  }
  return next;
}
