import { z } from "zod";

/**
 * Server-only environment loader.
 * Required services fail fast; optional services degrade to "disabled".
 */

const RequiredEnv = z.object({
  MONGODB_URI: z.string().min(1, "MongoDB connection string required"),
  MONGODB_DB: z.string().min(1).default("ucms"),
  BETTERAUTH_SECRET: z.string().min(16, "BetterAuth secret must be a long random string"),
  BETTERAUTH_URL: z.string().url().optional(),
});

const OptionalEnv = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

export type OptionalServices = {
  cloudinary: boolean;
  gemini: boolean;
  resend: boolean;
};

export type ServerEnv = z.infer<typeof RequiredEnv> &
  z.infer<typeof OptionalEnv> & { services: OptionalServices };

let cached: ServerEnv | null = null;

function build(): ServerEnv {
  const required = RequiredEnv.parse(process.env);
  const optional = OptionalEnv.parse(process.env);

  const services: OptionalServices = {
    cloudinary: Boolean(
      optional.CLOUDINARY_CLOUD_NAME &&
        optional.CLOUDINARY_API_KEY &&
        optional.CLOUDINARY_API_SECRET,
    ),
    gemini: Boolean(optional.GEMINI_API_KEY),
    resend: Boolean(optional.RESEND_API_KEY),
  };

  return { ...required, ...optional, services };
}

export function serverEnv(): ServerEnv {
  if (!cached) {
    try {
      cached = build();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const missing = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(
          `[env] Invalid environment configuration. ${missing}. ` +
            `Copy .env.example to .env.local and fill in real values.`,
        );
      }
      throw err;
    }
  }
  return cached;
}
