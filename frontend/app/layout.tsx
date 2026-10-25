import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "GovernAI", description: "AI governance, risk and lifecycle control" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
