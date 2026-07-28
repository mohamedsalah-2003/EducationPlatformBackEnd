import { userModel } from "../../../connections/models/user.model.js";
import { AppError, asyncHandler } from "../../utils/errorHandeling.js";
import cloudinary from "../../utils/cloudinaryConfigration.js";
import { submittedAssignmentModel } from "../../../connections/models/submittedAssignment.model.js";
import { submittedFinalTestModel } from "../../../connections/models/submittedFinalTest.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { cartModel } from "../../../connections/models/cart.model.js";
import { orderModel } from "../../../connections/models/order.model.js";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
import { courseModel } from "../../../connections/models/course.model.js";
import { withMongoTransaction } from "../../utils/transactions.js";
import { removeUploadedFile } from "../../utils/uploadCleanup.js";
import {
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../../services/passwords.js";
import {
  assertLoginAllowed,
  clearAccountLoginFailures,
  recordLoginFailure,
} from "../../services/loginThrottle.js";
import { generateAccessToken } from "../../utils/tokenFunction.js";
import { revokeAccessToken } from "../../services/tokenRevocation.js";
import { revokedTokenModel } from "../../../connections/models/revokedToken.model.js";
import {
  getPagination,
  getPaginationMetadata,
} from "../../utils/pagination.js";
import { logError } from "../../utils/logger.js";
//========================= Sign Up ==================

export const SignUp = asyncHandler(async (req, res, next) => {
  const { username, email, password, cPassword, gender } = req.body;

  const isUserExists = await userModel.findOne({ email });
  if (isUserExists) {
    return res.status(409).json({
      message: "An account with this email already exists",
      code: "ACCOUNT_ALREADY_EXISTS",
    });
  }

  const hashedPassword = await hashPassword(password);
  const userInstance = new userModel({
    username,
    email,
    password: hashedPassword,
    gender,
    role: "User",
  });

  try {
    await userInstance.save();
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists",
        code: "ACCOUNT_ALREADY_EXISTS",
      });
    }
    return next(error);
  }
  res.status(201).json({ message: 'Done', userInstance });
});

export const SignIn = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const throttleContext = { email, ip: req.ip };

  await assertLoginAllowed(throttleContext);

  const user = await userModel.findOne({ email }).select("+password");
  const passwordHash = user?.password ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!user || !passwordMatches) {
    await recordLoginFailure(throttleContext);
    throw new AppError(
      "Invalid login credentials",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  await clearAccountLoginFailures({ email });

  const userToken = generateAccessToken({ user });

  return res.status(200).json({ message: 'loggedIn success', userToken });
});

export const SignOut = asyncHandler(async (req, res) => {
  await revokeAccessToken({
    decodedToken: req.authToken,
    userId: req.authuser._id,
  });

  return res.status(200).json({ message: "Logged out successfully" });
});
//========================== Update profile =================

export const updateProfile = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const { email, username } = req.body;

  const userExist = await userModel.findOne({ email });

  if (!userExist) {
    return res.status(400).json({ message: "Email does not exist" });
  }

  if (userExist._id.toString() !== _id.toString()) {
    return res
      .status(401)
      .json({ message: "Unauthorized to take this action" });
  }

  const updateResult = await userModel.updateOne({ email }, { username });

  if (updateResult.modifiedCount) {
    // Re-fetch the updated user
    const updatedUser = await userModel.findById(_id);

    // Generate new token (adjust payload as needed)
    const token = generateAccessToken({ user: updatedUser });
    const returnedUser = {
      _id: updatedUser._id,
      email: updatedUser.email,
      username: updatedUser.username,
      role: updatedUser.role,
      gender: updatedUser.gender,
      profile_pic: updatedUser.profile_pic?.secure_url ?? null

    }
    return res.status(200).json({
      message: "Update done",
      token,
      user: returnedUser,
    });
  }

  res.status(400).json({ message: "Update failed" });
});

//========================== get user =======================

export const getUserProfile = asyncHandler(async (req, res) => {
  const { _id } = req.authuser;
  const user = await userModel.findById(_id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const returnedUser = {
    _id: user._id,
    email: user.email,
    username: user.username,
    role: user.role,
    gender: user.gender,
    profile_pic: user.profile_pic?.secure_url ?? null
  }
  return res.status(200).json({ message: "Done", user: returnedUser });

});
/////////////////////////////////////////////////////////////////////////

export const uploudProfilePic = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const previousPublicId = req.authuser.profile_pic?.public_id;

  if (!req.file) {
    return next(new Error("No file uploaded", { cause: 400 }));
  }

  try {
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: `user/profilePic/${_id}`,
        use_filename: true,
        unique_filename: true,
        resource_type: "image",
      }
    );

    const user = await userModel.findByIdAndUpdate(
      _id,
      {
        $set: {
          profile_pic: {
            secure_url,
            public_id,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      await cloudinary.uploader.destroy(public_id);

      return next(new Error("User not found", { cause: 404 }));
    }

    if (previousPublicId && previousPublicId !== public_id) {
      await cloudinary.uploader.destroy(previousPublicId, {
        resource_type: "image",
        invalidate: true,
      }).catch((error) => {
        logError("previous_profile_image_cleanup_failed", error, {
          userId: _id.toString(),
        });
      });
    }

    const returnedUser = {
      _id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      gender: user.gender,
      profile_pic: user.profile_pic?.secure_url ?? null
    };

    return res.status(200).json({
      message: "Profile picture uploaded successfully",
      user: returnedUser,
    });
  } finally {
    await removeUploadedFile(req.file);
  }
});


////////*************get all users */
export const getallusers = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const user = await userModel.findById(_id);
  if (!user) {
    return next(new Error("User not found", { cause: 404 }));
  }

  if (user.role === "Admin") {
    const { page, limit, skip } = getPagination(req.query);
    const [allUsers, total] = await Promise.all([
      userModel.find({}).sort({ _id: 1 }).skip(skip).limit(limit),
      userModel.countDocuments({}),
    ]);
    return res
      .status(200)
      .json({
        message: "all users returned only by admin",
        allUsers,
        pagination: getPaginationMetadata({ page, limit, total }),
      });
  }

  return next(
    new Error("Unauthorized - Admin access required", { cause: 403 })
  );
});
/*****************delete user */
export const deleteUserByAdmin = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const { userId } = req.body;
  let profilePublicId;

  await withMongoTransaction(async (session) => {
    const user = await userModel.findById(_id).session(session);
    if (!user || user.role !== "Admin") {
      throw new Error("Unauthorized - Admin access required", { cause: 403 });
    }

    const userToDelete = await userModel.findById(userId).session(session);
    if (!userToDelete) {
      throw new Error("User not found", { cause: 404 });
    }
    profilePublicId = userToDelete.profile_pic?.public_id;

    await submittedAssignmentModel.deleteMany({ userId }).session(session);
    await submittedFinalTestModel.deleteMany({ userId }).session(session);
    await enrolledCoursesModel.deleteMany({ userid: userId }).session(session);
    await cartModel.deleteMany({ userId }).session(session);
    await orderModel.deleteMany({ userId }).session(session);
    await courseEnrollmentLockModel.deleteMany({ userId }).session(session);
    await revokedTokenModel.deleteMany({ userId }).session(session);
    await courseModel
      .updateMany(
        { instructorId: userId },
        { $unset: { instructorId: "" } }
      )
      .session(session);
    await userModel.findByIdAndDelete(userId).session(session);
  });

  if (profilePublicId) {
    await cloudinary.uploader.destroy(profilePublicId).catch((error) => {
      logError("deleted_user_profile_cleanup_failed", error, {
        userId: userId.toString(),
      });
    });
  }

  return res.status(200).json({
    message: "User and all related records deleted successfully",
  });
});
