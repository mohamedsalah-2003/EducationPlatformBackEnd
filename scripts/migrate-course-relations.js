import { config } from "dotenv";
import mongoose from "mongoose";
import { courseModel } from "../connections/models/course.model.js";
import { finalTestModel } from "../connections/models/finalTest.model.js";
import { leasonModel } from "../connections/models/leason.model.js";
import { scheduleModel } from "../connections/models/schedule.model.js";
import {
  idsEqual,
  mergeSchedules,
} from "../src/migrations/courseRelations.js";

config();

const shouldApply = process.argv.includes("--apply");

const groupSchedulesByCourse = (schedules) => {
  const grouped = new Map();

  for (const schedule of schedules) {
    const courseId = schedule.courseId?.toString();
    if (!courseId) continue;

    const current = grouped.get(courseId) ?? [];
    current.push(schedule);
    grouped.set(courseId, current);
  }

  return grouped;
};

const inspectRelations = async ({ courses, schedulesByCourse }) => {
  const plans = [];
  const warnings = [];

  for (const course of courses) {
    const courseId = course._id.toString();
    const legacySchedules = schedulesByCourse.get(courseId) ?? [];
    const mergedSchedules = mergeSchedules(
      course.schedules ?? [],
      legacySchedules
    );
    const lessonIds = Array.isArray(course.lessons) ? course.lessons : [];
    const missingLessonCourseIds = [];

    if (lessonIds.length > 0) {
      const referencedLessons = await leasonModel.collection
        .find(
          { _id: { $in: lessonIds } },
          { projection: { courseId: 1 } }
        )
        .toArray();

      const foundLessonIds = new Set(
        referencedLessons.map((lesson) => lesson._id.toString())
      );

      for (const lessonId of lessonIds) {
        if (!foundLessonIds.has(lessonId.toString())) {
          warnings.push(
            `Course ${courseId} references missing lesson ${lessonId}`
          );
        }
      }

      for (const lesson of referencedLessons) {
        if (!lesson.courseId) {
          missingLessonCourseIds.push(lesson._id);
        } else if (!idsEqual(lesson.courseId, course._id)) {
          warnings.push(
            `Lesson ${lesson._id} belongs to ${lesson.courseId}, not ${courseId}; keeping the lesson's courseId`
          );
        }
      }
    }

    let finalTestIdToBackfill = null;
    if (course.finalTest) {
      const [referencedFinalTest, currentFinalTest] = await Promise.all([
        finalTestModel.collection.findOne(
          { _id: course.finalTest },
          { projection: { courseId: 1 } }
        ),
        finalTestModel.collection.findOne(
          { courseId: course._id },
          { projection: { _id: 1 } }
        ),
      ]);

      if (!referencedFinalTest) {
        warnings.push(
          `Course ${courseId} references missing final test ${course.finalTest}`
        );
      } else if (
        referencedFinalTest.courseId &&
        !idsEqual(referencedFinalTest.courseId, course._id)
      ) {
        warnings.push(
          `Final test ${referencedFinalTest._id} belongs to ${referencedFinalTest.courseId}, not ${courseId}; keeping the final test's courseId`
        );
      } else if (
        currentFinalTest &&
        !idsEqual(currentFinalTest._id, referencedFinalTest._id)
      ) {
        warnings.push(
          `Course ${courseId} already has final test ${currentFinalTest._id}; not reassigning legacy reference ${referencedFinalTest._id}`
        );
      } else if (!referencedFinalTest.courseId) {
        finalTestIdToBackfill = referencedFinalTest._id;
      }
    }

    plans.push({
      courseId: course._id,
      mergedSchedules,
      missingLessonCourseIds,
      finalTestIdToBackfill,
      legacyScheduleCount: legacySchedules.length,
      hadLegacyLessons: lessonIds.length > 0,
      hadLegacyFinalTest: Boolean(course.finalTest),
    });
  }

  return { plans, warnings };
};

const run = async () => {
  if (!process.env.DB_URL) {
    throw new Error("DB_URL is required");
  }

  await mongoose.connect(process.env.DB_URL, {
    serverSelectionTimeoutMS: 10000,
    dbName: process.env.DB_NAME || "educationPlatform",
  });

  const [courses, legacySchedules] = await Promise.all([
    courseModel.collection
      .find(
        {},
        {
          projection: {
            schedules: 1,
            lessons: 1,
            finalTest: 1,
          },
        }
      )
      .toArray(),
    scheduleModel.collection.find({}).toArray(),
  ]);

  const schedulesByCourse = groupSchedulesByCourse(legacySchedules);
  const courseIds = new Set(courses.map((course) => course._id.toString()));
  const orphanSchedules = legacySchedules.filter(
    (schedule) => !courseIds.has(schedule.courseId?.toString())
  );
  const { plans, warnings } = await inspectRelations({
    courses,
    schedulesByCourse,
  });

  const summary = {
    mode: shouldApply ? "apply" : "dry-run",
    courses: courses.length,
    schedulesToMerge: plans.reduce(
      (total, plan) => total + plan.legacyScheduleCount,
      0
    ),
    lessonCourseIdsToBackfill: plans.reduce(
      (total, plan) => total + plan.missingLessonCourseIds.length,
      0
    ),
    finalTestCourseIdsToBackfill: plans.filter(
      (plan) => plan.finalTestIdToBackfill
    ).length,
    legacyLessonArraysToRemove: plans.filter(
      (plan) => plan.hadLegacyLessons
    ).length,
    legacyFinalTestPointersToRemove: plans.filter(
      (plan) => plan.hadLegacyFinalTest
    ).length,
    orphanSchedulesLeftUntouched: orphanSchedules.length,
    warnings: warnings.length,
  };

  console.log(JSON.stringify(summary, null, 2));
  warnings.forEach((warning) => console.warn(`WARNING: ${warning}`));

  if (!shouldApply) {
    console.log(
      "Dry run only. Re-run with --apply after reviewing this report."
    );
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const plan of plans) {
        if (plan.missingLessonCourseIds.length > 0) {
          await leasonModel.collection.updateMany(
            {
              _id: { $in: plan.missingLessonCourseIds },
              $or: [
                { courseId: { $exists: false } },
                { courseId: null },
              ],
            },
            { $set: { courseId: plan.courseId } },
            { session }
          );
        }

        if (plan.finalTestIdToBackfill) {
          await finalTestModel.collection.updateOne(
            {
              _id: plan.finalTestIdToBackfill,
              $or: [
                { courseId: { $exists: false } },
                { courseId: null },
              ],
            },
            { $set: { courseId: plan.courseId } },
            { session }
          );
        }

        await courseModel.collection.updateOne(
          { _id: plan.courseId },
          {
            $set: { schedules: plan.mergedSchedules },
            $unset: { lessons: "", finalTest: "" },
          },
          { session }
        );
      }

      await scheduleModel.collection.deleteMany(
        { courseId: { $in: plans.map((plan) => plan.courseId) } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  console.log("Course relationship migration completed successfully.");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
