import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "./components/AppShell";
import { PRODUCT_DESCRIPTOR } from "../lib/brand";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#002e5f",
};

const title = "Beyond Hello | AI-Guided Conversation Studio";
const description = `${PRODUCT_DESCRIPTOR} Practice speaking, replay your conversation, and reflect before an oral proficiency interview.`;

export const metadata: Metadata = {
  title,
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/beyond-hello-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/beyond-hello-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/beyond-hello-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: [{ url: "/icons/beyond-hello-32.png", type: "image/png" }],
    apple: [{ url: "/icons/beyond-hello-180.png", sizes: "180x180", type: "image/png" }],
  },
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
