const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.authuser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.authuser.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
      });
    }

    // Keep this alias temporarily for controllers that still read req.user.
    req.user = req.authuser;
    return next();
  };
};

export const checkAdmin = () => authorizeRoles("Admin");

export const checkInstructor = () => authorizeRoles("Instructor");

export const checkAdminOrInstructor = () =>
  authorizeRoles("Admin", "Instructor");

export const checkUser = () => authorizeRoles("User");
