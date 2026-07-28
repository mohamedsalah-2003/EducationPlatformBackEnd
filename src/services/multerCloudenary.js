import multer from "multer"
import { allowedExtensions } from "../utils/allowedExtentions.js"
import { AppError } from "../utils/errorHandeling.js"

export const multercloudFunction = (allowedExtensionsArr) => {
  if (!allowedExtensionsArr) {
    allowedExtensionsArr = allowedExtensions.Image
  }

  const storage = multer.diskStorage({})

  const fileFilter = function (req, file, cb) {
    if (allowedExtensionsArr.includes(file.mimetype)) {
      return cb(null, true)
    }
    cb(
      new AppError(
        `Invalid file type "${file.mimetype}". Allowed types: ${allowedExtensionsArr.join(", ")}`,
        400,
        "INVALID_FILE_TYPE"
      ),
      false
    )
  }

  const acceptsVideo = allowedExtensionsArr.some((type) => type.startsWith('video/'));
  const maxFileSize = acceptsVideo
    ? 500 * 1024 * 1024
    : 10 * 1024 * 1024;

  const fileUpload = multer({
    fileFilter,
    storage,
    limits: {
      fileSize: maxFileSize,
      files: 1,
    }
  })

  return fileUpload
}
