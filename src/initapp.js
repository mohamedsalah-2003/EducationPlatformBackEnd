import cors from "cors"
import {userRouter,course,cart,order, leason} from "./allroutes.js"
import submittedAssignmentRoutes from "./modules/submittedAssignment/submittedAssignment.routes.js"
import finalTestRoutes from "./modules/finalTest/finalTest.routes.js"

export const initapp = (app, express)=>{
    const port =  process.env.PORT || 3000
app.use(express.json())
app.use(cors())
app.use('/user', userRouter)
app.use('/course',course)
app.use('/cart',cart)
app.use('/order',order)
app.use('/leason',leason)
app.use('/submittedAssignment', submittedAssignmentRoutes)
app.use('/finalTest', finalTestRoutes)



app.use('/test', (req, res, next) =>
  res.status(200).json({ message: 'tes' }),
)
app.all('*', (req, res, next) =>
    res.status(404).json({ message: '404 Not Found UL' }),
  )
app.use((err,req,res,next)=>{
  if(err){
    return res.status(err['cause'] ||500).json({message:err.message})
  }
})

}
