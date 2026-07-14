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
//========================= Sign Up ==================

export const SignUp = asyncHandler(async (req, res, next) => {
  const { username, email, password, cPassword, gender, role } = req.body;

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
    role,
  });

  await userInstance.save();
  res.status(201).json({ message: 'Done', userInstance });
});

export const SignIn = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const isUserExists = await userModel.findOne({ email });
  if (!isUserExists) {
    return next(new Error('Invalid login credentials (email)', { cause: 400 }));
  }

  const passMatch = bcrypt.compareSync(password, isUserExists.password);
  if (!passMatch) {
    return res.status(400).json({ message: 'Invalid login credentials (password)' });
  }

  const userToken = jwt.sign(
    {
      email,
      _id: isUserExists._id,
      username: isUserExists.username,
      score: isUserExists.score,
      role: isUserExists.role,
    },
    process.env.JWT_SECRET ,
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
        score: updatedUser.score,
        gender: updatedUser.gender,
      },
      process.env.JWT_SECRET, // use your secret from environment variables in production
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Update done",
      token,
      user: updatedUser,
    });
  }

  res.status(400).json({ message: "Update failed" });
});

//========================== get user =======================

export const getUserProfile = asyncHandler(async (req, res) => {
  const { _id } = req.authuser;
  const user = await userModel.findById(_id);

  if (user) {
    return res.status(200).json({ message: "Done", user });
  }
  return res.status(404).json({ message: "invalid id" });
});
/////////////////////////////////////////////////////////////////////////

export const uploudProfilePic = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  if (!req.file) {
    return next(new Error("no file uploaded", { cause: 400 }));
  }
  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.file.path,
    {
      folder: `user/profilePic/${_id}`,
      // public_id:`${_id}`
      use_filename: true,
      unique_filename: false,
      resource_type: "auto",
    }
  );
  // if(!data){
  //   return next(new Error("no data",{cause:400}))
  // }
  const user = await userModel.findByIdAndUpdate(
    _id,
    { profile_pic: { secure_url, public_id } },
    { new: true }
  );
  if (!user) {
    await cloudinary.uploader.destroy(public_id); //only one
    // await cloudinary.api.delete_all_resources([publicids])// delete bulk of publicids
  }
  res.status(200).json({ message: "done", user });
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
      orderModel.deleteMany({ userId })
    ]);

    // Finally delete the user
    await userModel.findByIdAndDelete(userdelete._id);

    return res.status(200).json({ message: "User and all related records deleted successfully" });
  }
  
  return next(new Error("Unauthorized - Admin access required", { cause: 403 }));
});
