import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Self-hosted at build time: visitors make no request to Google.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-poppins" });

export const metadata: Metadata = {
  title: "Kostenloser Standort-Check",
  description: "Prüfen Sie Ihr Grundstück – kostenlos und unverbindlich.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={poppins.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
