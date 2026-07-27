import { Router } from 'express';
import { isAuth } from '../../middelwares/auth.js';
import { checkAdminOrInstructor, checkUser } from '../../middelwares/adminAuth.js';
import {
  requireCourseAccess,
  requireCourseManagement,
  requireFinalTestSubmissionManagement,
} from '../../middelwares/courseAccess.js';
import {
  createFinalTest,
  createFinalTestSubmission,
  reviewAllFinalTestSubmissions,
  gradeFinalTestSubmission,
  getFinalTestFile,
  downloadStudentSubmission,
  getStudentFinalTestFeedback,

} from './finalTest.controller.js';
import { multercloudFunction } from '../../services/multerCloudenary.js';
import { allowedExtensions } from '../../utils/allowedExtentions.js';
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js';

const router = Router();



// Admin and Instructor routes
router.post(
  '/course/:courseId/create',
  isAuth(),
  checkAdminOrInstructor(),
  requireCourseManagement(),
  preventConcurrentRequests({
    operation: 'final-test-create',
    key: (req) => req.params.courseId,
    message: 'A final test upload is already in progress for this course',
  }),
  multercloudFunction(allowedExtensions.Files).single('finalTestFile'),
  createFinalTest
);
router.post(
  '/:submissionId/grade',
  isAuth(),
  checkAdminOrInstructor(),
  requireFinalTestSubmissionManagement(),
  preventConcurrentRequests({
    operation: 'final-test-grade',
    key: (req) => req.params.submissionId,
    message: 'This final test is already being graded',
  }),
  gradeFinalTestSubmission
);
router.get('/review', isAuth(), checkAdminOrInstructor(), reviewAllFinalTestSubmissions);
router.get('/submission/:submissionId/download', isAuth(), checkAdminOrInstructor(), requireFinalTestSubmissionManagement(), downloadStudentSubmission);

// Student routes
router.get('/course/:courseId/file', isAuth(), requireCourseAccess(), getFinalTestFile);
router.post(
  '/course/:courseId/submit',
  isAuth(),
  checkUser(),
  requireCourseAccess(),
  preventConcurrentRequests({
    operation: 'final-test-submission',
    key: (req) => `${req.authuser._id}:${req.params.courseId}`,
    message: 'This final test submission is already being uploaded',
  }),
  multercloudFunction(allowedExtensions.Files).single('finalTestFile'),
  createFinalTestSubmission
);
router.get('/feedback', isAuth(), checkUser(), getStudentFinalTestFeedback);

export default router;
