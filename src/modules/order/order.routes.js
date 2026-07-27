import { Router, raw } from 'express'

const router = Router()
export const orderWebhookRouter = Router()
import * as order from './order.controller.js'
import { isAuth } from '../../middelwares/auth.js'
import { checkUser } from '../../middelwares/adminAuth.js'
import { preventConcurrentRequests } from '../../middelwares/preventConcurrentRequests.js'

orderWebhookRouter.post(
  '/',
  raw({ type: 'application/json' }),
  order.handleStripeWebhook
)

router.post('/', isAuth(), checkUser(), preventConcurrentRequests({
  operation: 'checkout',
  key: (req) => req.authuser._id,
  message: 'Checkout is already being processed',
}), order.createOrderFromCart)
router.get('/payment/success', order.paymentSuccess)
router.get('/payment/cancel', order.paymentCancel)
router.get('/enrolled-courses', isAuth(), order.getEnrolledCourses)



export default router
