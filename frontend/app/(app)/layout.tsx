import type { ReactNode } from "react";
import Shell from "@/components/Shell";

// Every in-app page lives in this route group, so only these pages get the sidebar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
