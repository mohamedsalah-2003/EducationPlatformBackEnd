import 'dotenv/config';
import express from 'express';
import connectDB from './connections/dbconnection.js';
import { validateRuntimeConfiguration } from './src/config/runtimeConfig.js';
import { initapp } from './src/initapp.js';
import { logError, logInfo } from './src/utils/logger.js';

validateRuntimeConfiguration();

const app = express();
initapp(app, express);

const startServer = async () => {
  try {
    await connectDB();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      logInfo('server_started', { port });
    });
  } catch (error) {
    logError('server_start_failed', error);
    process.exitCode = 1;
  }
};

if (!process.env.VERCEL) {
  startServer();
}

export default app;
