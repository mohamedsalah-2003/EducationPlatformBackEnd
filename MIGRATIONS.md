# Course relationship migration

The application now keeps each course relationship in one place:

- schedules are embedded in `Course.schedules`;
- lessons reference their course through `Lesson.courseId`;
- final tests reference their course through `FinalTest.courseId`.
- assignment submissions reference their lesson through
  `SubmittedAssignment.lessonId`.

Existing databases may still contain the retired `Course.lessons`,
`Course.finalTest`, and separate `Schedule` records.
Lesson documents may also contain retired `Lesson.submissions` arrays.

## Run the migration

1. Back up the database.
2. Preview the migration without changing data:

   ```sh
   npm run migrate:course-relations:check
   ```

3. Review all warnings and orphan schedule records in the summary.
4. Apply the migration:

   ```sh
   npm run migrate:course-relations
   ```

5. Run the preview command again. No legacy course relationships or
   non-orphan schedule records should remain.

The apply command uses a MongoDB transaction, so the database must support
transactions. Child-side `courseId` values are treated as authoritative when
legacy parent references conflict with them.
