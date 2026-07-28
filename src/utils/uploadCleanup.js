import { unlink } from "node:fs/promises";
import { logError } from "./logger.js";

export const removeUploadedFile = async (file) => {
  if (!file?.path) return;

  try {
    await unlink(file.path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logError("temporary_upload_cleanup_failed", error);
    }
  }
};
