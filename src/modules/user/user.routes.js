import { Router } from 'express'
const router = Router()
import * as ur from './user.controller.js'
import { isAuth } from '../../middelwares/auth.js'
import {  validationCoreFunction } from '../../middelwares/validation.js'
import { SignInSchema, SignUpSchema } from './user.validationSchema.js'
import { multercloudFunction } from '../../services/multerCloudenary.js'
import { allowedExtensions } from '../../utils/allowedExtentions.js'
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js'
import { mutationSchemas } from '../../validation/apiSchemas.js'
import { paginationQuerySchema } from '../../validation/apiSchemas.js'



router.post(
  '/',
  validationCoreFunction(SignUpSchema),
  preventConcurrentRequests({
    operation: 'user-signup',
    key: (req) => req.body.email,
    message: 'This account is already being created',
  }),
  ur.SignUp
)
router.post('/login',validationCoreFunction(SignInSchema), ur.SignIn)
router.post('/logout', isAuth(), validationCoreFunction(mutationSchemas.empty), ur.SignOut)
router.patch('/', isAuth(), validationCoreFunction(mutationSchemas.userUpdate), preventConcurrentRequests({
  operation: 'profile-update',
  key: (req) => req.authuser._id,
}), ur.updateProfile)   //update only one
router.get('/', isAuth(),ur.getUserProfile)
router.post('/profile',isAuth(), preventConcurrentRequests({
  operation: 'profile-picture',
  key: (req) => req.authuser._id,
  message: 'A profile picture upload is already in progress',
}), multercloudFunction(allowedExtensions.Image).single('profile'), validationCoreFunction(mutationSchemas.empty), ur.uploudProfilePic)

router.get('/allUsers', isAuth(), validationCoreFunction({ query: paginationQuerySchema }), ur.getallusers)
router.delete('/deleteUser', isAuth(), validationCoreFunction(mutationSchemas.userDelete), preventConcurrentRequests({
  operation: 'user-delete',
  key: (req) => req.body.userId,
  message: 'This user is already being deleted',
}), ur.deleteUserByAdmin);

export default router
