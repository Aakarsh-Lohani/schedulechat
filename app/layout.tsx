import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.scss";
import { AuthProvider } from "@/lib/authProvider";
import { QueryProvider } from "@/lib/queryClient";

export const metadata: Metadata = {
  title: "ScheduleChat",
  description: "Personal schedule + time tracking, with an AI copilot.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at runtime via CDN link (not next/font) so the build never needs
            network access to Google Fonts — see log/mockups/00-design-notes.md.
            eslint-disable-next-line: this rule predates the App Router, where a
            <link> in the root layout is the supported pattern, not a per-page hack. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
