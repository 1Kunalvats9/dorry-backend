import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import { UploadApiResponse } from "cloudinary";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
    } else {
      cb(null, true);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  originalname: string
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: "raw" as const,
      folder: "pdfs",
      public_id: `${Date.now()}-${originalname.replace(/\s+/g, "_")}`,
      format: "pdf",
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error: any, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            format: result.format || "pdf",
            bytes: result.bytes,
          });
        } else {
          reject(new Error("Upload failed: No result returned"));
        }
      }
    );

    uploadStream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
    });
    console.log(`Successfully deleted ${publicId} from Cloudinary`);
  } catch (error) {
    console.error(`Error deleting ${publicId} from Cloudinary:`, error);
    throw error;
  }
}

export default upload;

