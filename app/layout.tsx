import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: "Snip No Evil — Three-Player Bomb Defusal",
  description:
    "An unofficial three-player browser bomb-defusal game. One player can't see, one can't hear, one can't speak.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
