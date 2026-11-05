import { createAuthClient } from "better-auth/react";

/**
 * Client-side BetterAuth access. `authClient.useSession()` powers
 * role-aware UI until Server Component session reads land in Phase 1.
 */
export const authClient = createAuthClient();

export const { useSession } = authClient;
