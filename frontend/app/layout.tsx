import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "700"]
});

const bodyMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "ThreatLens | Security Copilot",
  description: "AI chatbot and risk analytics dashboard for secure development workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${headingFont.variable} ${bodyMono.variable}`}>{children}</body>
    </html>
  );
}
