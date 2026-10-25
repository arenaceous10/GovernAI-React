import "./globals.css";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export const metadata = { title: "GovernAI", description: "AI governance, risk and lifecycle control" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
