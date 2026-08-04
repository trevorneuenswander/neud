export const DISPLAY_HTML_MAX_BYTES = 256 * 1024;

const HTML_EXTENSIONS = new Set(["html", "htm"]);

export type HtmlUploadValidationResult =
  | { ok: true; html: string; filename: string }
  | { ok: false; error: string };

export function isHtmlUploadFilename(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return HTML_EXTENSIONS.has(extension);
}

export function displayNameFromFilename(filename: string): string {
  const base = filename.replace(/\.(html|htm)$/i, "").replace(/[-_]+/g, " ").trim();
  if (!base) {
    return "New Display";
  }

  return base
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function validateHtmlUploadFile(file: File): HtmlUploadValidationResult | null {
  if (!file) {
    return { ok: false, error: "Choose an HTML file to upload." };
  }

  if (!isHtmlUploadFilename(file.name)) {
    return { ok: false, error: "Only .html and .htm files are supported." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "The selected HTML file is empty." };
  }

  if (file.size > DISPLAY_HTML_MAX_BYTES) {
    return {
      ok: false,
      error: `HTML file exceeds ${DISPLAY_HTML_MAX_BYTES} bytes.`,
    };
  }

  return null;
}

export async function readHtmlUploadFile(file: File): Promise<HtmlUploadValidationResult> {
  const fileError = validateHtmlUploadFile(file);
  if (fileError) {
    return fileError;
  }

  const html = await file.text();
  const trimmed = html.trim();
  if (!trimmed) {
    return { ok: false, error: "The selected HTML file is empty." };
  }

  if (new TextEncoder().encode(html).length > DISPLAY_HTML_MAX_BYTES) {
    return {
      ok: false,
      error: `HTML file exceeds ${DISPLAY_HTML_MAX_BYTES} bytes.`,
    };
  }

  const looksLikeHtml =
    /^<!doctype html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<(?:body|div|section|main|header|footer|style|script)[\s>]/i.test(trimmed);

  if (!looksLikeHtml) {
    return { ok: false, error: "The selected file does not appear to contain HTML." };
  }

  return { ok: true, html, filename: file.name };
}
