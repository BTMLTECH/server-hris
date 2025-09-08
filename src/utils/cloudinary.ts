import cloudinary from "cloudinary";
import { Readable } from "stream";

// Cloudinary Config (from .env)
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface UploadResult {
  secure_url: string;
  public_id: string;
}

/**
 * Uploads a buffer to Cloudinary
 * @param buffer - File buffer
 * @param folder - Cloudinary folder path
 * @param resourceType - "image" | "raw" | "video" (default: "raw")
 * @param publicId - Optional public ID (filename)
 * @param uploadPreset - Optional unsigned upload preset
 * @returns Promise resolving to uploaded file info
 */
export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "raw" | "auto" = "raw",
  publicId?: string,
  uploadPreset?: string
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const options: any = {
      folder,
      resource_type: resourceType,
    };

    if (uploadPreset) {
      options.upload_preset = uploadPreset; // use only if explicitly provided
    }

    if (publicId) {
      options.public_id = publicId;      // clean filename
      options.overwrite = true;          // overwrite if exists
      options.unique_filename = false;   // avoid random hash
    }

    const stream = cloudinary.v2.uploader.upload_stream(
      options,
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Cloudinary upload failed"));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        }
      }
    );

    Readable.from(buffer).pipe(stream);
  });
};
