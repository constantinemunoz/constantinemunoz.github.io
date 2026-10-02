import type { Metadata } from "next";
import { Lilita_One } from "next/font/google";
import "./globals.css";

// Chunky rounded display face for the SNIP NO EVIL title. next/font downloads it
// at build time and serves it from this site, so players never hit Google.
const display = Lilita_One({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-display" });

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
    <html lang="en" className={`dark ${display.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
