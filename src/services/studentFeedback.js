import { submittedAssignmentModel } from "../../connections/models/submittedAssignment.model.js";
import { submittedFinalTestModel } from "../../connections/models/submittedFinalTest.model.js";

const authenticatedUserId = (authUser) => {
  if (!authUser?._id) {
    throw new Error("Authenticated user ID is required", { cause: 401 });
  }
  return authUser._id;
};

export const findStudentAssignmentFeedback = ({
  authUser,
  skip = 0,
  limit = 25,
  model = submittedAssignmentModel,
}) =>
  model
    .find({ userId: authenticatedUserId(authUser) })
    .sort({ submittedAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate("userId", "username email")
    .populate({
      path: "reviewerId",
      select: "username email",
    })
    .populate({
      path: "lessonId",
      select: "title courseId",
      populate: {
        path: "courseId",
        select: "title",
      },
    });

export const findStudentFinalTestFeedback = ({
  authUser,
  skip = 0,
  limit = 25,
  model = submittedFinalTestModel,
}) =>
  model
    .find({ userId: authenticatedUserId(authUser) })
    .sort({ submittedAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate("userId", "username email")
    .populate({
      path: "reviewerId",
      select: "username email",
    })
    .populate({
      path: "finalTestId",
      select: "courseId",
      populate: {
        path: "courseId",
        select: "title",
      },
    });
