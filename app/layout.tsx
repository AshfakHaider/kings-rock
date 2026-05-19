import type { Metadata } from "next";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kings Rock",
  description: "Full-stack dashboard for gaming account stock, sales, and profit tracking"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
