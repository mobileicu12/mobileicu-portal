import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FaviconManager from "@/components/FaviconManager";
import { storageKey } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BUSINESS.name} Portal`,
  description: `Inventory control for ${BUSINESS.name}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Key is injected so it stays in step with ThemeToggle; JSON.stringify
            // keeps it safely quoted inside the inline script.
            __html: `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey("theme"))});if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink theme-anim"><FaviconManager />{children}</body>
    </html>
  );
}
