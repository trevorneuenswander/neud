import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { DesktopAppShell } from "@/components/portal/DesktopAppShell";
import { DisplayInlinePreviewProvider } from "@/lib/displays/display-inline-preview-context";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding/app-name";
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

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_NAME} — ${APP_TAGLINE}`,
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
