import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Grocery & Shared Pantry",
  description: "Real-time collaborative shopping manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
