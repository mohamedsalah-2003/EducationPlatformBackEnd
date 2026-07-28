export const attachLessonSubmissions = (lessons, submissions) => {
  const submissionsByLesson = new Map();

  for (const submission of submissions) {
    const lessonId = submission.lessonId?.toString();
    if (!lessonId) continue;

    const lessonSubmissions = submissionsByLesson.get(lessonId) ?? [];
    lessonSubmissions.push(submission);
    submissionsByLesson.set(lessonId, lessonSubmissions);
  }

  return lessons.map((lesson) => ({
    ...lesson,
    submissions: submissionsByLesson.get(lesson._id.toString()) ?? [],
  }));
};
