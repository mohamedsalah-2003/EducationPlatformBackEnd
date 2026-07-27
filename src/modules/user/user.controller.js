import { userModel } from "../../../connections/models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/errorHandeling.js";
import cloudinary from "../../utils/cloudinaryConfigration.js";
import { submittedAssignmentModel } from "../../../connections/models/submittedAssignment.model.js";
import { submittedFinalTestModel } from "../../../connections/models/submittedFinalTest.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { cartModel } from "../../../connections/models/cart.model.js";
import { orderModel } from "../../../connections/models/order.model.js";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
//========================= Sign Up ==================

export const SignUp = asyncHandler(async (req, res, next) => {
  const { username, email, password, cPassword, gender } = req.body;

  const isUserExists = await userModel.findOne({ email });
  if (isUserExists) {
    return res.status(400).json({ message: 'Email is already exist' });
  }

  const hashedPassword = bcrypt.hashSync(password, +process.env.SALT_ROUNDS);
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

  const isUserExists = await userModel.findOne({ email }).select("+password");
  if (!isUserExists) {
    return next(new Error('Invalid login credentials', { cause: 400 }));
  }

  const passMatch = bcrypt.compareSync(password, isUserExists.password);
  if (!passMatch) {
    return res.status(400).json({ message: 'Invalid login credentials' });
  }

  const userToken = jwt.sign(
    {
      email,
      _id: isUserExists._id,
      username: isUserExists.username,
      score: isUserExists.score,
      role: isUserExists.role,
    },
    process.env.JWT_SECRET,{ expiresIn: "7d" }
  );

  isUserExists.token = userToken;
  await isUserExists.save();

  res.status(200).json({ message: 'loggedIn success', userToken });
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
    const token = jwt.sign(
      {
        _id: updatedUser._id,
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
        gender: updatedUser.gender,

      },
      process.env.JWT_SECRET, // use your secret from environment variables in production
      { expiresIn: "7d" }
    );
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
      console.error("Failed to delete previous profile image:", error.message);
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
});


////////*************get all users */
export const getallusers = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const user = await userModel.findById(_id);
  if (!user) {
    return next(new Error("User not found", { cause: 404 }));
  }

  if (user.role === "Admin") {
    const allUsers = await userModel.find({});
    return res
      .status(200)
      .json({ message: "all users returned only by admin", allUsers });
  }

  return next(
    new Error("Unauthorized - Admin access required", { cause: 403 })
  );
});
/*****************delete user */
export const deleteUserByAdmin = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const { userId } = req.body;

  const user = await userModel.findById(_id);
  const userdelete = await userModel.findById(userId);

  if (!userdelete) {
    return res.json({ message: "cannot found user" });
  }

  if (user.role == "Admin") {
    // Delete all related records
    await Promise.all([
      // Delete submitted assignments
      submittedAssignmentModel.deleteMany({ userId }),
      // Delete submitted final tests
      submittedFinalTestModel.deleteMany({ userId }),
      // Delete enrolled courses
      enrolledCoursesModel.deleteMany({ userid: userId }),
      // Delete cart
      cartModel.deleteMany({ userId }),
      // Delete orders
      orderModel.deleteMany({ userId }),
      // Delete course purchase locks
      courseEnrollmentLockModel.deleteMany({ userId })
    ]);

    // Finally delete the user
    await userModel.findByIdAndDelete(userdelete._id);

    return res.status(200).json({ message: "User and all related records deleted successfully" });
  }

  return next(new Error("Unauthorized - Admin access required", { cause: 403 }));
});
