import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "펫플로우 | 반려동물 건강 기록",
  description:
    "반려동물의 오늘을 기록하고 병원 방문에 필요한 정보를 한눈에 정리하세요.",
  applicationName: "펫플로우",
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
