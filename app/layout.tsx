import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "./components/AppShell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#002e5f",
};

const title = "AI OPI Conversation Studio";
const description = "Choose a language, speak, replay, and review a fluent example in a practice-only conversation studio.";

export const metadata: Metadata = {
  title,
  description,
  manifest: "/manifest.webmanifest",
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
