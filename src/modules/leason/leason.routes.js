import { Router } from 'express';
import { addleason, 
  getLessonsByCourse,  
  addvideotoleason,
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

const router = Router();


// Lesson routes
router.post(
  '/',
  isAuth(),
  checkAdminOrInstructor(),
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
router.post('/:lessonId/video', isAuth(), checkAdminOrInstructor(), requireLessonManagement(), preventConcurrentRequests({
  operation: 'lesson-video',
  key: (req) => req.params.lessonId,
  message: 'A video upload is already in progress for this lesson',
}), multercloudFunction(allowedExtensions.Videos).single('video'), addvideotoleason);
router.post('/:lessonId/submit', isAuth(), checkAdminOrInstructor(), requireLessonManagement(), preventConcurrentRequests({
  operation: 'lesson-assignment',
  key: (req) => req.params.lessonId,
  message: 'An assignment upload is already in progress for this lesson',
}), multercloudFunction(allowedExtensions.Files).single('file'), uploadAssignment);
router.get('/:lessonId/assignment/download', isAuth(), requireLessonAccess(), downloadAssignment);

export default router;
