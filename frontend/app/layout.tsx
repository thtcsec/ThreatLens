import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "700"]
});

const bodySans = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  title: "ThreatLens | Security Copilot",
  description: "Advanced AI chatbot and risk analytics dashboard for secure development workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodySans.variable}`}>
        {children}
      </body>
    </html>
  );
}
