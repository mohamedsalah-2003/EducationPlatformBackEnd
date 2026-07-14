import jwt from "jsonwebtoken";

const verifyRequestToken = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

export const checkAdmin = () => {
  return async (req, res, next) => {
    const decoded = verifyRequestToken(req);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (decoded.role !== "Admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    req.user = decoded;
    next();
  };
};

export const checkInstructor = () => {
  return async (req, res, next) => {
    const decoded = verifyRequestToken(req);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (decoded.role !== "Instructor") {
      return res.status(403).json({ message: "Access denied. Instructors only." });
    }

    req.user = decoded;
    next();
  };
};

export const checkAdminOrInstructor = () => {
  return async (req, res, next) => {
    const decoded = verifyRequestToken(req);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (decoded.role !== "Admin" && decoded.role !== "Instructor") {
      return res.status(403).json({ message: "Access denied. Admin or Instructor access required." });
    }

    req.user = decoded;
    next();
  };
};