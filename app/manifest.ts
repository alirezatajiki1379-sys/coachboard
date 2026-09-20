import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CoachBoard",
    short_name: "CoachBoard",
    description: "Football training planner for coaches",
    start_url: "/",
    display: "standalone",
    background_color: "#F7FAF8",
    theme_color: "#13202F",
    icons: [
      { src: "/coachboard-brand/app-icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/coachboard-brand/app-icon-512x512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
