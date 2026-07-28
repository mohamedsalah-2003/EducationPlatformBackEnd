import cors from "cors"
import {userRouter,course,cart,order, leason} from "./allroutes.js"
import submittedAssignmentRoutes from "./modules/submittedAssignment/submittedAssignment.routes.js"
import finalTestRoutes from "./modules/finalTest/finalTest.routes.js"
import { orderWebhookRouter } from "./modules/order/order.routes.js"
import {
  globalErrorHandler,
  notFoundHandler,
} from "./utils/errorHandeling.js"
import {
  createCorsOptions,
  rejectUnsafeRequestInput,
  securityHeaders,
} from "./middelwares/requestSecurity.js"
import connectDB from "../connections/dbconnection.js"
import healthRouter from "./modules/health/health.routes.js"
import { observeRequests } from "./middelwares/observability.js"
import { createApiRateLimiter } from "./middelwares/rateLimit.js"

export const initapp = (app, express)=>{
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(securityHeaders)
app.use(observeRequests)
app.use('/health', healthRouter)
app.use(async (req, res, next) => {
  try {
    await connectDB()
    return next()
  } catch (error) {
    return next(error)
  }
})
app.use('/order/webhook', orderWebhookRouter)
app.use(cors(createCorsOptions()))
app.use(createApiRateLimiter())
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }))
app.use(rejectUnsafeRequestInput)
app.use('/user', userRouter)
app.use('/course',course)
app.use('/cart',cart)
app.use('/order',order)
app.use('/leason',leason)
app.use('/submittedAssignment', submittedAssignmentRoutes)
app.use('/finalTest', finalTestRoutes)



app.all('*', notFoundHandler)
app.use(globalErrorHandler)

}
