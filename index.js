import express from "express";
const app = express();
import { config } from "dotenv";
import { initapp } from "./src/initapp.js";
import connectDB from './connections/dbconnection.js'; // حسب مكان الملف
config();
const startServer = async () => {
    await connectDB(); // ✅ اتصل قبل أي استخدام للـ Models
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 Server is running on ${port}`);
    });
  };
  
  startServer();
initapp(app, express);
export default app;
