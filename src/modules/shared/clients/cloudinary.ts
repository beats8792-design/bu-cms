import { v2, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { serverEnv } from "@/lib/env";

/**
 * Cloudinary wrapper. Disabled cleanly when keys are not configured
 * (Phase 0 has no uploads yet; this only centralizes configuration).
 */

type Uploader = typeof v2.uploader;

let uploaderInstance: Uploader | null = null;

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super("Cloudinary is not configured. Add CLOUDINARY_* keys to .env.local.");
  }
}

function uploader(): Uploader {
  if (!uploaderInstance) {
    const env = serverEnv();
    if (!env.services.cloudinary) {
      throw new CloudinaryNotConfiguredError();
    }
    v2.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    uploaderInstance = v2.uploader;
  }
  return uploaderInstance;
}

export function cloudinaryEnabled(): boolean {
  return serverEnv().services.cloudinary;
}

export async function uploadFile(
  file: string,
  options: UploadApiOptions,
): Promise<UploadApiResponse> {
  return uploader().upload(file, options);
}

/**
 * Signed direct-to-browser upload (Phase 3): only the server holds the API
 * secret, the browser posts the file straight to Cloudinary's raw endpoint.
 */
export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: "raw";
}

export function signRawUpload(folder: string): SignedUpload {
  const env = serverEnv();
  if (!env.services.cloudinary) throw new CloudinaryNotConfiguredError();
  const cloudName = env.CLOUDINARY_CLOUD_NAME ?? "";
  const apiKey = env.CLOUDINARY_API_KEY ?? "";
  const apiSecret = env.CLOUDINARY_API_SECRET ?? "";
  if (!cloudName || !apiKey || !apiSecret) throw new CloudinaryNotConfiguredError();
  const timestamp = Math.floor(Date.now() / 1000);
  // api_sign_request sorts params alphabetically and hashes with the secret —
  // only params included here may be sent by the browser.
  const signature = v2.utils.api_sign_request({ folder, timestamp }, apiSecret);
  return {
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    resourceType: "raw",
  };
}

/** Delivery URL with a forced download name (raw resources). */
export function materialDeliveryUrl(publicId: string, fileName: string): string {
  const env = serverEnv();
  if (!env.services.cloudinary) throw new CloudinaryNotConfiguredError();
  const cloudName = env.CLOUDINARY_CLOUD_NAME ?? "";
  if (!cloudName) throw new CloudinaryNotConfiguredError();
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return `https://res.cloudinary.com/${cloudName}/raw/upload/fl_attachment:${safeName}/${publicId}`;
}
