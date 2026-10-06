import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./temple-theme.css";
import { TempleScene } from "./temple-scene";

// GoofusHand is the only font in the game. app/fonts/goofus-hand.woff2 is built
// from fonts-src/GoofusHand.ttf by scripts/build-font.py. It is tiny and
// preloaded, so "block" avoids a flash of a different font on first paint.
const goofusHand = localFont({
  src: "./fonts/goofus-hand.woff2",
  variable: "--font-goofus",
  display: "block",
  weight: "400",
  style: "normal",
  preload: true,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Games · constantinemunoz.github.io",
  description: "Browser games to play with friends.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${goofusHand.variable}`}>
      <body className="antialiased"><TempleScene />{children}</body>
    </html>
  );
}
