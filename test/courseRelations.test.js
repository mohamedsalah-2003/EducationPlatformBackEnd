import test from "node:test";
import assert from "node:assert/strict";
import { courseModel } from "../connections/models/course.model.js";
import {
  idsEqual,
  mergeSchedules,
} from "../src/migrations/courseRelations.js";

test("course schema has one source of truth for relationships", () => {
  assert.ok(courseModel.schema.path("schedules"));
  assert.equal(courseModel.schema.path("lessons"), undefined);
  assert.equal(courseModel.schema.path("finalTest"), undefined);
  assert.equal(courseModel.schema.virtualpath("scheduleRefs"), null);
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
