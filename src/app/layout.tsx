import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { DesktopAppShell } from "@/components/portal/DesktopAppShell";
import { DisplayInlinePreviewProvider } from "@/lib/displays/display-inline-preview-context";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding/app-name";
import {
  NEUD_ICON_192_PATH,
  NEUD_ICON_ASSET_VERSION,
  NEUD_ICON_PATH,
  NEUD_OG_IMAGE_PATH,
} from "@/lib/branding/logo";
import { isDesktopRuntime } from "@/lib/runtime/environment";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription =
  "A professional live graphics and data integration platform built for broadcast and live production. Local-first desktop operation with optional online published viewers.";

export const metadata: Metadata = {
  title: APP_NAME,
  description: siteDescription,
  applicationName: APP_NAME,
  manifest: `/site.webmanifest?v=${NEUD_ICON_ASSET_VERSION}`,
  icons: {
    icon: [
      { url: `/favicon.ico?v=${NEUD_ICON_ASSET_VERSION}`, sizes: "any" },
      {
        url: `/favicon-16x16.png?v=${NEUD_ICON_ASSET_VERSION}`,
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: `/favicon-32x32.png?v=${NEUD_ICON_ASSET_VERSION}`,
        sizes: "32x32",
        type: "image/png",
      },
      { url: NEUD_ICON_192_PATH, sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: `/apple-touch-icon.png?v=${NEUD_ICON_ASSET_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: [`/favicon.ico?v=${NEUD_ICON_ASSET_VERSION}`],
  },
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      "Professional live graphics and data integration for broadcast and live production.",
    siteName: APP_NAME,
    images: [
      {
        url: NEUD_OG_IMAGE_PATH,
        width: 512,
        height: 512,
        alt: `${APP_NAME} icon`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      "Professional live graphics and data integration for broadcast and live production.",
    images: [NEUD_OG_IMAGE_PATH],
  },
  other: {
    "msapplication-TileImage": NEUD_ICON_PATH,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtime = isDesktopRuntime() ? "desktop" : "hosted";

  return (
    <html
      lang="en"
      data-runtime={runtime}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-background text-foreground">
        <DisplayInlinePreviewProvider>
          <Suspense
            fallback={
              <div className="relative h-dvh overflow-hidden bg-background text-foreground">
                {children}
              </div>
            }
          >
            <DesktopAppShell initialRuntime={runtime}>{children}</DesktopAppShell>
          </Suspense>
        </DisplayInlinePreviewProvider>
      </body>
    </html>
  );
}
