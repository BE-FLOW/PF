import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pf-two-eta.vercel.app"),
  title: "펫플로우 | 반려동물 건강 기록",
  description:
    "반려동물의 오늘을 기록하고 병원 방문에 필요한 정보를 한눈에 정리하세요.",
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
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "ko_KR",
    siteName: "PetFlow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "펫플로우 | 반려동물 건강 기록",
    description:
      "오늘 기록, 경과 연결, 수의사 검토용 요약까지 보호자의 설명 부담을 줄여요.",
    images: ["/og-image.png"],
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
    <html lang="ko" className={notoSansKr.variable}>
      <body>{children}</body>
    </html>
  );
}
