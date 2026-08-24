import type { Metadata, Viewport } from "next";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/600.css";
import "@fontsource/pretendard/700.css";
import "@fontsource/pretendard/800.css";
import "@fontsource/pretendard/900.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://pf-two-eta.vercel.app"),
  title: "펫플로우 | 반려동물 건강 기록",
  description:
    "병원 가기 전 보호자 관찰을 남기고 사실 중심 전달본으로 정리하세요.",
  applicationName: "펫플로우",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  },
  openGraph: {
    title: "펫플로우 | 반려동물 건강 기록",
    description:
      "관찰을 병원에 전달하기 좋은 흐름으로 정리하는 반려동물 건강 기록",
    locale: "ko_KR",
    siteName: "PetFlow",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "펫플로우 | 반려동물 건강 기록",
    description:
      "병원 가기 전 관찰을 남기고 사실 중심 전달본으로 정리해 보호자의 설명 부담을 줄여요.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7faf6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
