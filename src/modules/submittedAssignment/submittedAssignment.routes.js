import { Router } from 'express';
import { 
  createSubmission, 
  downloadMySubmission,
  downloadSubmission,
  reviewAllSubmissions,
  gradeSubmission,
  getStudentAssignmentSubmissions,
} from './submittedAssignment.controller.js';
import { isAuth } from '../../middelwares/auth.js';
import { checkAdminOrInstructor, checkUser } from '../../middelwares/adminAuth.js';
import {
  requireAssignmentSubmissionManagement,
  requireLessonAccess,
} from '../../middelwares/courseAccess.js';
import multer from 'multer';
import { validatePdfUpload } from '../../middelwares/fileValidation.js';
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js';
import { validationCoreFunction } from '../../middelwares/validation.js';
import { mutationSchemas } from '../../validation/apiSchemas.js';
import { paginationQuerySchema } from '../../validation/apiSchemas.js';


const router = Router();

// Configure multer for memory storage (for Cloudinary upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new Error('Only PDF files are allowed', { cause: 400 }), false);
    }
    return callback(null, true);
  },
});


// Student routes
router.get('/my-submissions/:submissionId/download', isAuth(), checkUser(), downloadMySubmission);
router.post(
  '/:lessonId/submissions',
  isAuth(),
  checkUser(),
  validationCoreFunction(mutationSchemas.submissionCreate),
  requireLessonAccess(),
  preventConcurrentRequests({
    operation: 'assignment-submission',
    key: (req) => `${req.authuser._id}:${req.params.lessonId}`,
    message: 'This assignment submission is already being uploaded',
  }),
  upload.single('file'),
  validatePdfUpload,
  validationCoreFunction(mutationSchemas.empty),
  createSubmission
);
router.get('/submissions', isAuth(), checkUser(), validationCoreFunction({ query: paginationQuerySchema }), getStudentAssignmentSubmissions);

// Admin and Instructor routes
router.get('/review', isAuth(), checkAdminOrInstructor(), validationCoreFunction({ query: paginationQuerySchema }), reviewAllSubmissions);
router.post(
  '/:submissionId/grade',
  isAuth(),
  checkAdminOrInstructor(),
  validationCoreFunction(mutationSchemas.submissionGrade),
  requireAssignmentSubmissionManagement(),
  preventConcurrentRequests({
    operation: 'assignment-grade',
    key: (req) => req.params.submissionId,
    message: 'This submission is already being graded',
  }),
  gradeSubmission
);
router.get('/:submissionId/download', isAuth(), checkAdminOrInstructor(), requireAssignmentSubmissionManagement(), downloadSubmission);

export default router;
