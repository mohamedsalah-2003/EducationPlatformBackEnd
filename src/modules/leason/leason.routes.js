import { Router } from 'express';
import { addleason, 
  getLessonsByCourse,  
  getLessonVideoUploadSignature,
  completeLessonVideoUpload,
  uploadAssignment,
  downloadAssignment
} from './leason.controller.js';
import { isAuth } from '../../middelwares/auth.js';
import { multercloudFunction } from '../../services/multerCloudenary.js';
import { allowedExtensions } from '../../utils/allowedExtentions.js';
import { checkAdminOrInstructor } from '../../middelwares/adminAuth.js'
import {
  requireCourseAccess,
  requireCourseManagement,
  requireLessonAccess,
  requireLessonManagement,
} from '../../middelwares/courseAccess.js';
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js';
import { validatePdfUpload } from '../../middelwares/fileValidation.js';
import { validationCoreFunction } from '../../middelwares/validation.js';
import { mutationSchemas } from '../../validation/apiSchemas.js';

const router = Router();


// Lesson routes
router.post(
  '/',
  isAuth(),
  checkAdminOrInstructor(),
  validationCoreFunction(mutationSchemas.lessonCreate),
  requireCourseManagement({ source: 'body' }),
  preventConcurrentRequests({
    operation: 'lesson-create',
    key: (req) => `${req.body.courseId}:${req.body.LessonTitle}`,
    message: 'This lesson is already being created',
  }),
  addleason
);
router.get('/course/:courseId', isAuth(), requireCourseAccess(), getLessonsByCourse);
// Video and assignment routes
router.post(
  '/:lessonId/video/signature',
  isAuth(),
  checkAdminOrInstructor(),
  validationCoreFunction(mutationSchemas.lessonParams),
  requireLessonManagement(),
  validationCoreFunction(mutationSchemas.empty),
  getLessonVideoUploadSignature
);
router.post('/:lessonId/video/complete', isAuth(), checkAdminOrInstructor(), validationCoreFunction(mutationSchemas.lessonVideoComplete), requireLessonManagement(), preventConcurrentRequests({
  operation: 'lesson-video',
  key: (req) => req.params.lessonId,
  message: 'A video is already being attached to this lesson',
}), completeLessonVideoUpload);
router.post('/:lessonId/submit', isAuth(), checkAdminOrInstructor(), validationCoreFunction(mutationSchemas.lessonParams), requireLessonManagement(), preventConcurrentRequests({
  operation: 'lesson-assignment',
  key: (req) => req.params.lessonId,
  message: 'An assignment upload is already in progress for this lesson',
}), multercloudFunction(allowedExtensions.Files).single('file'), validatePdfUpload, validationCoreFunction(mutationSchemas.lessonAssignment), uploadAssignment);
router.get('/:lessonId/assignment/download', isAuth(), requireLessonAccess(), downloadAssignment);

export default router;
