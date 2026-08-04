export const APP_NAME = "NEUD";
export const APP_TAGLINE = "The Ultimate Data Stripper";

export function getAppName(): string {
  return APP_NAME;
}

export function getAppTitle(pageTitle?: string): string {
  if (pageTitle && pageTitle !== APP_NAME) {
    return `${pageTitle} · ${APP_NAME}`;
  }

  return APP_NAME;
}
