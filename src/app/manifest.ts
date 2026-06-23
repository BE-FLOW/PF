import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "펫플로우",
    short_name: "펫플로우",
    description: "반려동물 건강 기록과 병원 방문 준비 리포트",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8f4",
    theme_color: "#f5f8f4",
    lang: "ko",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
