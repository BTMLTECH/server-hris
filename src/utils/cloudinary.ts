"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = void 0;
const cloudinary_1 = __importDefault(require("cloudinary"));
const stream_1 = require("stream");
// Cloudinary Config (load from .env)
cloudinary_1.default.v2.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadToCloudinary = (buffer, folder, resourceType = "raw", publicId, // ✅ Added publicId param
uploadPreset) => {
    return new Promise((resolve, reject) => {
        const options = {
            folder,
            resource_type: resourceType,
        };
        if (uploadPreset) {
            options.upload_preset = uploadPreset; // ✅ Apply preset if provided
        }
        if (publicId) {
            options.public_id = publicId; // ✅ Set clean filename
            options.overwrite = true; // ✅ Overwrite if already exists
            options.unique_filename = false; // ✅ Prevent random hash
        }
        const stream = cloudinary_1.default.v2.uploader.upload_stream(options, (error, result) => {
            if (error || !result) {
                reject(error);
            }
            else {
                resolve({
                    secure_url: result.secure_url,
                    public_id: result.public_id,
                });
            }
        });
        stream_1.Readable.from(buffer).pipe(stream);
    });
};
exports.uploadToCloudinary = uploadToCloudinary;
