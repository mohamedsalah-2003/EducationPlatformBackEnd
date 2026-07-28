import { revokedTokenModel } from "../../connections/models/revokedToken.model.js";
import { AppError } from "../utils/errorHandeling.js";

export const isTokenRevoked = ({ jwtId, model = revokedTokenModel } = {}) => {
  if (!jwtId) return true;
  return model.exists({ _id: jwtId });
};

export const revokeAccessToken = async ({
  decodedToken,
  userId,
  model = revokedTokenModel,
  now = new Date(),
} = {}) => {
  if (!decodedToken?.jti || !decodedToken?.exp) {
    throw new AppError(
      "This token cannot be revoked",
      401,
      "INVALID_TOKEN"
    );
  }

  const expiresAt = new Date(decodedToken.exp * 1000);
  if (expiresAt <= now) return;

  await model.updateOne(
    { _id: decodedToken.jti },
    {
      $setOnInsert: {
        userId,
        expiresAt,
      },
    },
    { upsert: true }
  );
};
