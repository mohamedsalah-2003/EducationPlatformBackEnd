import { Router } from 'express'
const router = Router()
import * as course from './course.controller.js'
import { isAuth } from '../../middelwares/auth.js'
import { checkAdmin, checkAdminOrInstructor } from '../../middelwares/adminAuth.js'
import { multercloudFunction } from '../../services/multerCloudenary.js'
import { allowedExtensions } from '../../utils/allowedExtentions.js'
import { requireCourseManagement } from '../../middelwares/courseAccess.js'
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js'


router.post(
  '/',
  isAuth(),
  checkAdminOrInstructor(),
  preventConcurrentRequests({
    operation: 'course-create',
    key: (req) => req.body.title,
    message: 'This course is already being created',
  }),
  course.addCourse
)
router.get('/',course.getCourses)
router.patch(
  '/:courseId/instructor',
  isAuth(),
  checkAdmin(),
  preventConcurrentRequests({
    operation: 'course-instructor',
    key: (req) => req.params.courseId,
  }),
  course.assignInstructor
)
router.delete(
  '/:courseId',
  isAuth(),
  checkAdminOrInstructor(),
  requireCourseManagement(),
  preventConcurrentRequests({
    operation: 'course-delete',
    key: (req) => req.params.courseId,
    message: 'This course is already being deleted',
  }),
  course.deleteCourse
);
router.post('/:courseId/cover', isAuth(), checkAdminOrInstructor(), requireCourseManagement(), preventConcurrentRequests({
  operation: 'course-cover',
  key: (req) => req.params.courseId,
  message: 'A course image upload is already in progress',
}), multercloudFunction(allowedExtensions.Image).single('courseimage'),course.uploadCoursePic
);



export default router
