import cloudinary from 'cloudinary';
import { Readable } from 'stream';

// Cloudinary Config (load from .env)
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});



export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
  uploadPreset?: string  // ✅ Optional Upload Preset
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    const options: cloudinary.UploadApiOptions = {
      folder,
      resource_type: resourceType,
    };

    if (uploadPreset) {
      options.upload_preset = uploadPreset;  // ✅ Apply preset if provided
    }

    const stream = cloudinary.v2.uploader.upload_stream(
      options,
      (error, result) => {
        if (error || !result) {
          reject(error);
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,  // ✅ Useful if you need to delete/update later
          });
        }
      }
    );

    Readable.from(buffer).pipe(stream);
  });
};


// const videoResult = await uploadToCloudinary(req.file.buffer, 'hris/videos', 'video');
// const videoUrl = videoResult.secure_url;


// const imageResult = await uploadToCloudinary(req.file.buffer, 'hris/images', 'image');
// const imageUrl = imageResult.secure_url;
