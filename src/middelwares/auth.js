import { userModel } from '../../connections/models/user.model.js';
import { verifyToken } from '../utils/tokenFunction.js' // عدّل المسار حسب مكان الملف

export const isAuth = () => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(400).json({ message: "Please send a valid token in the Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    const decodedData = verifyToken({ token });

    if (!decodedData || !decodedData._id) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const findUser = await userModel.findById(decodedData._id);

    if (!findUser) {
      return res.status(400).json({ message: "Please sign up first" });
    }

    req.authuser = findUser;
    next();
  };
};