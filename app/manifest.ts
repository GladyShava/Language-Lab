import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beyond Hello",
    short_name: "Beyond Hello",
    description: "Voice-first conversation practice for reflection and improvement.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#002e5f",
    orientation: "portrait",
    icons: [
      { src: "/icons/beyond-hello-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/beyond-hello-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
