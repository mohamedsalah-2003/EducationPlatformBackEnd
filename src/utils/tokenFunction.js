import jwt from 'jsonwebtoken'

// ========================= generation ==============================
export const generateToken = ({
  payload = {},
  signature = process.env.DEFAULT_SIGNATURE,
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
  signature = process.env.DEFAULT_SIGNATURE,
} = {}) => {
  if (!token) {
    return false
  }
  try {
    const data = jwt.verify(token, signature)
    return data
  } catch (error) {
    console.error('Token verification failed:', error.message)
    return false
  }
}