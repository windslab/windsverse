import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Winds Space | Coffee, Space & Conversation",
  description: "Kafe Winds Space secara langsung, suasana ruang, dan status pesanan.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
