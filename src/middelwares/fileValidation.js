import { open } from "node:fs/promises";
import { asyncHandler, AppError } from "../utils/errorHandeling.js";
import { removeUploadedFile } from "../utils/uploadCleanup.js";

const PDF_HEADER = Buffer.from("%PDF-");

const readHeader = async (file, length) => {
  if (Buffer.isBuffer(file?.buffer)) {
    return file.buffer.subarray(0, length);
  }

  if (!file?.path) return Buffer.alloc(0);

  const handle = await open(file.path, "r");
  try {
    const header = Buffer.alloc(length);
    const { bytesRead } = await handle.read(header, 0, length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

export const validatePdfUpload = asyncHandler(async (req, res, next) => {
  if (!req.file) return next();

  const header = await readHeader(req.file, PDF_HEADER.length);
  if (!header.equals(PDF_HEADER)) {
    await removeUploadedFile(req.file);
    return next(
      new AppError(
        "The uploaded file is not a valid PDF",
        400,
        "INVALID_PDF"
      )
    );
  }

  return next();
});
