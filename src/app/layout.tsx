import type { Metadata } from "next";
import { Antonio, Archivo, Fragment_Mono } from "next/font/google";
import "./globals.css";

const display = Antonio({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-antonio", display: "swap" });
const body = Archivo({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-archivo", display: "swap" });
const data = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment", display: "swap" });

const description =
  "Paste a messy order; Gemini Nano fills the form on your laptop via Firebase AI Logic. Code keeps only what is in your text.";

export const metadata: Metadata = {
  metadataBase: new URL("https://pastewise.edycu.dev"),
  title: "Pastewise",
  description,
  authors: [{ name: "Edy Cu" }],
  creator: "Edy Cu",
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" } },
  openGraph: {
    type: "website",
    siteName: "Pastewise",
    title: "Pastewise — order forms, filled on your laptop",
    description,
    url: "/",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pastewise: text from your paste sent to the cloud, 0 bytes found; boxes pressed in carbon blue, one phone number amber" }],
  },
  twitter: { card: "summary_large_image", creator: "@edycutjong", title: "Pastewise — order forms, filled on your laptop", description, images: ["/og-image.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
