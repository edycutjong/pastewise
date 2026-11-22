import type { Metadata } from "next";
import { Antonio, Archivo, Fragment_Mono } from "next/font/google";
import "./globals.css";

const display = Antonio({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-antonio", display: "swap" });
const body = Archivo({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-archivo", display: "swap" });
const data = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment", display: "swap" });

export const metadata: Metadata = {
  title: "Pastewise",
  description: "Paste a messy order message; with the on-device model the form fills on your laptop (Gemini Nano via Firebase AI Logic); the cloud is used only if you say Yes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
