import test from "node:test";
import assert from "node:assert/strict";
import { courseModel } from "../connections/models/course.model.js";
import { leasonModel } from "../connections/models/leason.model.js";
import {
  idsEqual,
  mergeSchedules,
} from "../src/migrations/courseRelations.js";
import { attachLessonSubmissions } from "../src/services/lessonSubmissions.js";

test("course schema has one source of truth for relationships", () => {
  assert.ok(courseModel.schema.path("schedules"));
  assert.equal(courseModel.schema.path("lessons"), undefined);
  assert.equal(courseModel.schema.path("finalTest"), undefined);
  assert.equal(courseModel.schema.virtualpath("scheduleRefs"), null);
  assert.equal(leasonModel.schema.path("submissions"), undefined);
});

test("schedule migration merges embedded and legacy schedules without duplicates", () => {
  const merged = mergeSchedules(
    [{ day: "Monday", time: "10:00" }],
    [
      { day: "Monday", time: "10:00" },
      { day: " Tuesday ", time: " 14:00 " },
      { day: "", time: "12:00" },
    ]
  );

  assert.deepEqual(merged, [
    { day: "Monday", time: "10:00" },
    { day: "Tuesday", time: "14:00" },
  ]);
});

test("relationship IDs are compared by value", () => {
  assert.equal(idsEqual("abc", { toString: () => "abc" }), true);
  assert.equal(idsEqual("abc", "def"), false);
  assert.equal(idsEqual(null, "abc"), false);
});

test("lesson responses attach submissions from the authoritative collection", () => {
  const lessons = [
    { _id: { toString: () => "lesson-1" }, title: "First lesson" },
    { _id: { toString: () => "lesson-2" }, title: "Second lesson" },
  ];
  const submissions = [
    {
      _id: "submission-1",
      lessonId: { toString: () => "lesson-1" },
    },
    {
      _id: "submission-2",
      lessonId: { toString: () => "lesson-1" },
    },
  ];

  const result = attachLessonSubmissions(lessons, submissions);

  assert.deepEqual(
    result[0].submissions.map((submission) => submission._id),
    ["submission-1", "submission-2"]
  );
  assert.deepEqual(result[1].submissions, []);
  assert.equal("submissions" in lessons[0], false);
});
