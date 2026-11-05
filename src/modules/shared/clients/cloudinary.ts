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
