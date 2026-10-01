import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOMBANANA — Three-Player Browser Drill",
  description:
    "An unofficial three-player browser bomb-defusal game with Blind, Deaf, and Mute roles.",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
