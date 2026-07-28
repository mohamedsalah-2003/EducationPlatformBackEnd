import { randomUUID } from "node:crypto";
import jwt from 'jsonwebtoken'

// ========================= generation ==============================
export const generateToken = ({
  payload = {},
  signature = process.env.JWT_SECRET,
  expiresIn = '1d',
} = {}) => {
  // check if the payload is empty object
  if (!Object.keys(payload).length) {
    return false
  }
  const token = jwt.sign(payload, signature, { expiresIn })
  return token
}

// =========================  Verify ==============================
export const verifyToken = ({
  token = '',
  signature = process.env.JWT_SECRET,
} = {}) => {
  if (!token) {
    return false
  }
  try {
    const data = jwt.verify(token, signature)
    return data
  } catch {
    return false
  }
}

export const generateAccessToken = ({
  user,
  signature = process.env.JWT_SECRET,
  expiresIn = "7d",
} = {}) => {
  if (!user?._id) return false;

  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      username: user.username,
      score: user.score,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    signature,
    {
      expiresIn,
      jwtid: randomUUID(),
    }
  );
};
