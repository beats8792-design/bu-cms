import { AppShell } from "@/components/app-shell";

/** Layout for all signed-in app areas. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
