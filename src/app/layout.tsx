import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pastewise",
  description: "Paste a messy order message; the form fills on your laptop with Gemini Nano via Firebase AI Logic.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
