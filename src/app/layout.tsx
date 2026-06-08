import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin", "vietnamese"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "mPriceGold — Giá vàng",
  description: "Giá vàng realtime từ các tiệm vàng.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-app text-primary font-body antialiased">{children}</body>
    </html>
  );
}
