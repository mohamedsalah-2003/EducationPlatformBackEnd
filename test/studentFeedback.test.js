import test from "node:test";
import assert from "node:assert/strict";
import {
  findStudentAssignmentFeedback,
  findStudentFinalTestFeedback,
} from "../src/services/studentFeedback.js";

const fakeModel = (onFind) => ({
  find(filter) {
    onFind(filter);

    const query = {
      sort() {
        return query;
      },
      skip() {
        return query;
      },
      limit() {
        return query;
      },
      populate() {
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve([]).then(resolve, reject);
      },
    };

    return query;
  },
});

test("assignment feedback filters by authenticated user ID, not user document", async () => {
  const authUser = { _id: "student-1", role: "User" };
  let capturedFilter;

  await findStudentAssignmentFeedback({
    authUser,
    model: fakeModel((filter) => {
      capturedFilter = filter;
    }),
  });

  assert.deepEqual(capturedFilter, { userId: "student-1" });
  assert.notEqual(capturedFilter.userId, authUser);
});

test("final-test feedback filters by authenticated user ID, not user document", async () => {
  const authUser = { _id: "student-2", role: "User" };
  let capturedFilter;

  await findStudentFinalTestFeedback({
    authUser,
    model: fakeModel((filter) => {
      capturedFilter = filter;
    }),
  });

  assert.deepEqual(capturedFilter, { userId: "student-2" });
  assert.notEqual(capturedFilter.userId, authUser);
});

test("feedback queries require an authenticated user ID", () => {
  assert.throws(
    () =>
      findStudentAssignmentFeedback({
        authUser: {},
        model: fakeModel(() => undefined),
      }),
    /Authenticated user ID is required/,
  );
});
