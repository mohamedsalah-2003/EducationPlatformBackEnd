import joi from 'joi';
import { generalFields } from '../middelwares/validation.js';

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const text = (label, max = 500) =>
  joi.string().trim().min(1).max(max).required().label(label);

const optionalText = (label, max = 2000) =>
  joi.string().trim().allow('').max(max).optional().label(label);

const objectId = generalFields.id;
const idParams = (name) => joi.object({ [name]: objectId }).required();
const emptyBody = joi.object({}).max(0).required();

const schedule = joi
  .object({
    day: joi.string().valid(...days).required(),
    time: joi
      .string()
      .trim()
      .pattern(
        /^(?:[01]\d|2[0-3]):[0-5]\d$|^(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM)$/i
      )
      .required(),
  })
  .required();

const gradeBody = joi
  .object({
    rating: joi.number().min(0).max(5).required(),
    feedback: optionalText('feedback', 4000),
  })
  .required();

export const mutationSchemas = {
  empty: { body: emptyBody },
  userUpdate: {
    body: joi
      .object({
        email: generalFields.email,
        username: text('username', 30).min(3),
      })
      .required(),
  },
  userDelete: {
    body: joi.object({ userId: objectId }).required(),
  },
  cartCourse: {
    body: joi.object({ courseId: objectId }).required(),
  },
  cartAdd: {
    body: joi
      .object({
        courseId: objectId,
        schedule,
      })
      .required(),
  },
  courseCreate: {
    body: joi
      .object({
        title: text('title', 120),
        description: text('description', 5000),
        price: joi.number().positive().precision(2).max(1_000_000).required(),
        schedules: joi.array().items(schedule).min(1).max(50).unique().required(),
        instructorId: objectId.optional(),
      })
      .required(),
  },
  courseParams: { params: idParams('courseId') },
  courseInstructor: {
    params: idParams('courseId'),
    body: joi.object({ instructorId: objectId }).required(),
  },
  lessonCreate: {
    body: joi
      .object({
        LessonTitle: text('LessonTitle', 160),
        LessonDescription: text('LessonDescription', 5000),
        courseId: objectId,
      })
      .required(),
  },
  lessonParams: { params: idParams('lessonId') },
  lessonVideoComplete: {
    params: idParams('lessonId'),
    body: joi
      .object({
        publicId: joi.string().trim().min(1).max(500).required(),
        version: joi.number().integer().positive().required(),
        signature: joi.string().hex().length(40).required(),
      })
      .required(),
  },
  lessonAssignment: {
    params: idParams('lessonId'),
    body: joi
      .object({
        title: text('title', 160),
        description: optionalText('description', 4000),
        dueDate: joi.date().iso().greater('now').required(),
      })
      .required(),
  },
  submissionParams: { params: idParams('submissionId') },
  submissionCreate: {
    params: idParams('lessonId'),
  },
  submissionGrade: {
    params: idParams('submissionId'),
    body: gradeBody,
  },
  finalTestCourse: { params: idParams('courseId') },
  finalTestGrade: {
    params: idParams('submissionId'),
    body: gradeBody,
  },
  checkout: {
    body: joi.object({ cartId: objectId }).required(),
  },
};

export const paginationQuerySchema = joi
  .object({
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(25),
  })
  .required();
