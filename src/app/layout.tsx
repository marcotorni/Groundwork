import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Groundwork — Lisbon Location Intelligence",
  description:
    "AI-powered location intelligence for specialty coffee in Lisbon. Population density, footfall, competitors, and 12-month forecasts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full bg-stone-50 text-stone-900">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
