import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";

export async function openExternalUrl(url: string): Promise<void> {
  if (!url.trim()) {
    return;
  }

  if (isDesktopEnvironment()) {
    const api = getDesktopAPI();
    if (api?.app?.openExternal) {
      await api.app.openExternal(url);
      return;
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
