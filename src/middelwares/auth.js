import { userModel } from '../../connections/models/user.model.js';
import { isTokenRevoked } from '../services/tokenRevocation.js';
import { AppError, asyncHandler } from '../utils/errorHandeling.js';
import { verifyToken } from '../utils/tokenFunction.js' // عدّل المسار حسب مكان الملف

export const isAuth = () => {
  return asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(
        "Authentication is required",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const decodedData = verifyToken({ token });

    if (
      !decodedData?._id ||
      !decodedData.jti ||
      !Number.isInteger(decodedData.tokenVersion)
    ) {
      throw new AppError(
        "Invalid or expired token",
        401,
        "INVALID_TOKEN"
      );
    }

    const [findUser, revoked] = await Promise.all([
      userModel.findById(decodedData._id),
      isTokenRevoked({ jwtId: decodedData.jti }),
    ]);

    if (!findUser) {
      throw new AppError(
        "Invalid or expired token",
        401,
        "INVALID_TOKEN"
      );
    }

    if (revoked || (findUser.tokenVersion ?? 0) !== decodedData.tokenVersion) {
      throw new AppError(
        "This session is no longer valid",
        401,
        "TOKEN_REVOKED"
      );
    }

    req.authuser = findUser;
    req.authToken = decodedData;
    req.accessToken = token;
    return next();
  });
};
