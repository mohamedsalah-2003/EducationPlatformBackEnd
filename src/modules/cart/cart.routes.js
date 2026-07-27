import { Router } from 'express'

const router = Router()
import * as cart from './cart.controller.js'
import { isAuth } from '../../middelwares/auth.js'
import { checkUser } from '../../middelwares/adminAuth.js'
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js'

router.get('/getCart', isAuth(), checkUser(), cart.getCart);
router.post('/addToCart', isAuth(), checkUser(), preventConcurrentRequests({
  operation: 'cart-add',
  key: (req) => `${req.authuser._id}:${req.body.courseId}`,
}), cart.addToCart)
router.delete('/course', isAuth(), checkUser(), preventConcurrentRequests({
  operation: 'cart-remove',
  key: (req) => `${req.authuser._id}:${req.body.courseId}`,
}), cart.deleteCourseFromCart)
router.delete('/clear', isAuth(), checkUser(), preventConcurrentRequests({
  operation: 'cart-clear',
  key: (req) => req.authuser._id,
}), cart.clearCart);

export default router

