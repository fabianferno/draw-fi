import type { Metadata } from "next";
import "./globals.css";
import { ProvidersWrapper } from "@/components/providers-wrapper";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://draw-fi.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DrawFi — Draw your futures",
    template: "%s · DrawFi",
  },
  description:
    "Draw your BTC curve on a live chart, stake small, settle in 60 seconds. Gasless opens on Base via Yellow Network—no order book, no liquidations maze.",
  keywords: [
    "DrawFi",
    "crypto futures",
    "Yellow Network",
    "Base",
    "derivatives",
    "prediction trading",
    "chart trading",
  ],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "DrawFi",
    title: "DrawFi — Draw your futures",
    description:
      "Turn chart intuition into a 60-second game: draw your curve, gasless stakes on Base with Yellow Network.",
    images: [
      {
        url: "/banner.png",
        width: 2560,
        height: 1366,
        alt: "DrawFi — draw your curve on live charts, futures on Base with Yellow Network",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DrawFi — Draw your futures",
    description:
      "Draw your price curve on live charts. Micro-stakes, fast settlement, gasless opens on Base.",
    images: ["/banner.png"],
  },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#00E5FF" />
      </head>
      <body className="antialiased  bg-[#0a0a0a] font-sans">
        <ProvidersWrapper>
          {children}
        </ProvidersWrapper>
      </body>
    </html>
  );
}
