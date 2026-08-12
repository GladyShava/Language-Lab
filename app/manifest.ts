import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI OPI Conversation Studio",
    short_name: "OPI Studio",
    description: "Voice-first conversation practice for reflection and improvement.",
    start_url: "/practice",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#002e5f",
    orientation: "portrait",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
