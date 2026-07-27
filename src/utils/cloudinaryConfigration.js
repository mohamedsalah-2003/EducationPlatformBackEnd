import { v2 as cloudinary } from "cloudinary";
import { config } from "dotenv";

// Prefer the conventional .env file, while keeping the current DotEnv.env
// filename working during migration.
config();

if (!process.env.CLOUDINARY_API_KEY) {
  config({ path: "DotEnv.env" });
}

const cloudinarySettings = {
  api_key: process.env.CLOUDINARY_API_KEY ,
  api_secret: process.env.CLOUDINARY_API_SECRET ,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ,
};

const missingSettings = Object.entries(cloudinarySettings)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingSettings.length > 0) {
  throw new Error(
    `Missing Cloudinary configuration: ${missingSettings.join(", ")}`
  );
}

cloudinary.config(cloudinarySettings);

export default cloudinary;
