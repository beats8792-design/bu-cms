import { serverEnv } from "@/lib/env";

/**
 * Minimal Resend REST wrapper (emails only, no SDK dependency).
 * Domain verification is required for real "from" addresses — see
 * Brain/MEMORY.md and web-app/.env.example notes.
 */

export const DEFAULT_FROM = "Jazbah UCMS <onboarding@resend.dev>";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<{ sent: boolean }> {
  const env = serverEnv();
  if (!env.services.resend) return { sent: false };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text: text ?? subject,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[resend] ${res.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true };
}
