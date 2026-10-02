import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
