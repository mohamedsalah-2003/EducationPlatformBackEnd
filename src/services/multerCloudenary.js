import multer from "multer"
import { allowedExtensions } from "../utils/allowedExtentions.js"

export const multercloudFunction = (allowedExtensionsArr) => {
  if (!allowedExtensionsArr) {
    allowedExtensionsArr = allowedExtensions.Image
  }

  const storage = multer.diskStorage({})

  const fileFilter = function (req, file, cb) {
    if (allowedExtensionsArr.includes(file.mimetype)) {
      return cb(null, true)
    }
    cb(new Error('invalid extension', { cause: 400 }), false)
  }

  const acceptsVideo = allowedExtensionsArr.some((type) => type.startsWith('video/'));
  const maxFileSize = acceptsVideo
    ? 500 * 1024 * 1024
    : 10 * 1024 * 1024;

  const fileUpload = multer({
    fileFilter,
    storage,
    limits: {
      fileSize: maxFileSize
    }
  })

  return fileUpload
}
