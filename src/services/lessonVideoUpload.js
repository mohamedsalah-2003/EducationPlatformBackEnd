import { randomUUID, timingSafeEqual } from "node:crypto";
import cloudinary from "../utils/cloudinaryConfigration.js";
import { AppError } from "../utils/errorHandeling.js";

export const MAX_LESSON_VIDEO_BYTES = 500 * 1024 * 1024;

const allowedVideoFormats = new Set([
  "mp4",
  "mpeg",
  "mpg",
  "mkv",
  "webm",
  "ogg",
  "ogv",
  "mov",
  "avi",
  "wmv",
]);

const cloudinaryConfig = () => {
  const settings = cloudinary.config();
  return {
    apiKey: settings.api_key,
    apiSecret: settings.api_secret,
    cloudName: settings.cloud_name,
  };
};

const signaturesMatch = (actual, expected) => {
  if (typeof actual !== "string" || actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

export const createLessonVideoUploadSignature = ({
  lessonId,
  timestamp = Math.floor(Date.now() / 1000),
  publicId = randomUUID(),
} = {}) => {
  if (!lessonId) {
    throw new AppError("Lesson ID is required", 400, "LESSON_ID_REQUIRED");
  }

  const { apiKey, apiSecret, cloudName } = cloudinaryConfig();
  const folder = `lesson/video/${lessonId}`;
  const allowedFormats = [...allowedVideoFormats].join(",");
  const uploadParams = {
    allowed_formats: allowedFormats,
    folder,
    public_id: publicId,
    timestamp,
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    apiKey,
    allowedFormats,
    timestamp,
    folder,
    publicId,
    signature: cloudinary.utils.api_sign_request(uploadParams, apiSecret),
    maxBytes: MAX_LESSON_VIDEO_BYTES,
  };
};

export const verifyLessonVideoUpload = async ({
  lessonId,
  publicId,
  version,
  signature,
  getResource = (id) =>
    cloudinary.api.resource(id, { resource_type: "video" }),
} = {}) => {
  const { apiSecret, cloudName } = cloudinaryConfig();
  const expectedFolder = `lesson/video/${lessonId}/`;
  const expectedSignature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    apiSecret
  );

  if (
    !publicId?.startsWith(expectedFolder) ||
    !signaturesMatch(signature, expectedSignature)
  ) {
    throw new AppError(
      "The uploaded video could not be verified",
      400,
      "INVALID_VIDEO_UPLOAD"
    );
  }

  const resource = await getResource(publicId);
  const format = String(resource.format ?? "").toLowerCase();
  const secureUrl = resource.secure_url;

  if (
    resource.resource_type !== "video" ||
    !allowedVideoFormats.has(format) ||
    !Number.isFinite(resource.bytes) ||
    resource.bytes <= 0 ||
    resource.bytes > MAX_LESSON_VIDEO_BYTES ||
    typeof secureUrl !== "string" ||
    !secureUrl.startsWith(
      `https://res.cloudinary.com/${cloudName}/video/upload/`
    )
  ) {
    throw new AppError(
      "The uploaded resource is not an allowed lesson video",
      400,
      "INVALID_VIDEO_UPLOAD"
    );
  }

  return {
    secure_url: secureUrl,
    public_id: resource.public_id,
    duration: resource.duration,
    format,
  };
};
