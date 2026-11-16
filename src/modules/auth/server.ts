import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createMongoClient } from "@/lib/db";
import { sendEmail } from "@/lib/resend";

/**
 * BetterAuth is built against the same MongoClient as domain data so
 * transactions are available (Atlas replica set).
 *
 * ID strategy (see Brain/ARCHITECTURE.md §4):
 * - BetterAuth keeps its default string ids on user/session/account/verification.
 * - Domain documents store `userId: string`; never join into auth collections.
 */

const globalForAuth = globalThis as unknown as {
  __ucmsAuth?: ReturnType<typeof createAuth>;
};

function createAuth() {
  const mongo = createMongoClient();
  return mongo.then(({ client, db }) =>
    betterAuth({
      database: mongodbAdapter(db, { client }),
      // BetterAuth's verify-email/reset links live under the API base path.
      baseURL: process.env.BETTERAUTH_URL
        ? `${process.env.BETTERAUTH_URL.replace(/\/$/, "")}/api/auth`
        : undefined,
      emailAndPassword: {
        enabled: true,
        // Email verification is only enforceable when the mailer works.
        requireEmailVerification: Boolean(process.env.RESEND_API_KEY),
        sendResetPassword: async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Reset your BU-CMS password",
            html: resetPasswordHtml(url),
          });
        },
      },
      emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
          await sendEmail({
            to: user.email,
            subject: "Verify your BU-CMS account",
            html: verificationHtml(url),
          });
        },
      },
      // Defense-in-depth: the /api/auth/sign-up/email endpoint is public, so
      // EVERY user created through BetterAuth lands pending + student. Roles,
      // verification and activation happen only through admin flows below.
      databaseHooks: {
        user: {
          create: {
            before: async (user) => ({
              data: { ...user, role: "student", status: "pending" },
            }),
          },
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // refresh daily
      },
      user: {
        additionalFields: {
          role: {
            type: "string",
            defaultValue: "student",
            required: false,
            input: false, // set server-side only (registration/approval), never from client
          },
          displayName: { type: "string", required: false, input: true },
          departmentId: { type: "string", required: false, input: false },
          studentId: { type: "string", required: false, input: false },
          status: {
            type: "string",
            defaultValue: "active",
            required: false,
            input: false, // active | pending | suspended, managed by admin flows
          },
        },
      },
      // NOTE: `advanced.database.joins: true` was removed — with it the mongo
      // adapter returns joined account docs raw (key `passwordHash`), which
      // breaks the sign-in password lookup (core expects field `password`).
      // The fallback join does the same work with correct field mapping.
      rateLimit: {
        enabled: true,
        window: 60, // seconds
        max: 30, // per window; auth endpoints get their own stricter limits via auth API config later
      },
    }),
  );
}

export const APP_NAME = "BU-CMS";

const shell = (title: string, body: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;border:1px solid #e4e1d8;border-radius:8px">
    <div style="background:#155e42;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
      <span style="font-size:15px;font-weight:600">${APP_NAME}</span>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1c2b24">${title}</h2>
      ${body}
    </div>
  </div>`;

const button = (url: string, label: string) => `
  <a href="${url}" style="display:inline-block;background:#155e42;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">${label}</a>`;

const verificationHtml = (url: string) =>
  shell("Verify your account", `<p>Confirm this email to continue. This link expires soon.</p><p>${button(url, "Verify email")}</p><p style="color:#5c6b62;font-size:12px">Or paste this URL: ${url}</p>`);

const resetPasswordHtml = (url: string) =>
  shell("Reset your password", `<p>Click below to choose a new password. If you didn't request this, ignore this email.</p><p>${button(url, "Set new password")}</p><p style="color:#5c6b62;font-size:12px">Or paste this URL: ${url}</p>`);

export async function getAuth() {
  globalForAuth.__ucmsAuth ??= createAuth();
  return globalForAuth.__ucmsAuth;
}
