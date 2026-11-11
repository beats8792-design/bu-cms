import { appGate } from "@/modules/auth/session";
import { AppShell } from "@/components/app-shell";

// Auth gate reads the session cookie at request time; this segment blocks on
// the server (migration pattern from Next 16 authentication-with-cache-components
// guide). Streaming shells can be adopted per-route in later phases.
export const instant = false;

/** Layout for all signed-in app areas; the gate redirects per account status. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await appGate();
  return (
    <AppShell role={session.user.role} name={session.user.name} email={session.user.email}>
      {children}
    </AppShell>
  );
}
