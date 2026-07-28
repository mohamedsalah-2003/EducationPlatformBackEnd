# Vercel Deployment Guide

This guide will walk you through deploying your Education Platform Backend to Vercel.

## Prerequisites

1. **GitHub Account**: Your code should be in a GitHub repository
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **MongoDB Database**: Set up a MongoDB database (Atlas recommended for production)
4. **Cloudinary Account**: For file storage
5. **Stripe Account**: For payment processing

## Step 1: Prepare Your Code

### 1.1 Ensure Your Code is Ready
Make sure your code is working locally and all dependencies are properly listed in `package.json`.

### 1.2 Check Configuration Files
- ✅ `vercel.json` - Vercel configuration
- ✅ `package.json` - Dependencies and scripts
- ✅ `.gitignore` - Excludes unnecessary files
- ✅ `README.md` - Project documentation

### 1.3 Push to GitHub
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

## Step 2: Deploy to Vercel

### Option A: Using Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

2. **Create New Project**
   - Click "New Project"
   - Import your GitHub repository
   - Select the repository containing your backend code

3. **Configure Project Settings**
   - **Framework Preset**: Node.js
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build` (or leave empty)
   - **Output Directory**: `./` (leave as default)
   - **Install Command**: `npm ci`

4. **Set Environment Variables**
   - Click "Environment Variables"
   - Add each variable from your `.env` file:

   ```env
   NODE_ENV=production
   DB_URL=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   PUBLIC_API_URL=https://your-backend-domain.vercel.app
   FRONTEND_URL=https://your-frontend-domain.vercel.app
   MONITORING_TOKEN=generate_a_long_random_monitoring_token
   API_RATE_LIMIT_SECRET=generate_a_long_random_rate_limit_secret
   API_RATE_LIMIT_WINDOW_MINUTES=15
   API_RATE_LIMIT_MAX_REQUESTS=300
   SALT_ROUNDS=12
   ```

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete

### Option B: Using Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Follow the prompts**
   - Link to existing project or create new
   - Set environment variables when prompted

## Step 3: Configure Environment Variables

### 3.1 MongoDB Database
- Use MongoDB Atlas for production
- Get your connection string from Atlas dashboard
- Format: `mongodb+srv://username:password@cluster.mongodb.net/database`

### 3.2 JWT Secret
- Generate a cryptographically random secret of at least 32 characters.
- Run:

  ```sh
  node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  ```

- Store the result in Vercel as `JWT_SECRET`; never place the generated value
  in Git.

### 3.3 Cloudinary Configuration
- Get credentials from Cloudinary dashboard
- Cloud Name, API Key, and API Secret

### 3.4 Stripe Configuration
- Get keys from Stripe dashboard
- Use test keys for development, live keys for production
- Register `https://your-backend-domain.vercel.app/order/webhook` as a Stripe
  webhook endpoint.
- Subscribe to `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, and `checkout.session.expired`.
- Store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

## Step 4: Test Your Deployment

### 4.1 Check Deployment Status
- Go to your Vercel dashboard
- Check if deployment was successful
- Look for any build errors

### 4.2 Test API Endpoints
Use tools like Postman or curl to test your endpoints:

```bash
# Test the health endpoint
curl https://your-app.vercel.app/health/live
curl https://your-app.vercel.app/health/ready

# Test user registration
curl -X POST https://your-app.vercel.app/user \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "cPassword": "password123"
  }'
```

### 4.3 Check Logs
- In Vercel dashboard, go to Functions tab
- Check for any runtime errors
- Monitor function execution times

## Step 5: Configure Custom Domain (Optional)

1. **Add Domain in Vercel**
   - Go to Settings > Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update DNS Records**
   - Add CNAME record pointing to your Vercel app
   - Wait for DNS propagation (can take up to 48 hours)

## Step 6: Monitor and Maintain

### 6.1 Set Up Monitoring
- Enable Vercel Analytics
- Set up error tracking (Sentry recommended)
- Monitor function performance

### 6.2 Regular Updates
- Keep dependencies updated
- Monitor security vulnerabilities
- Update environment variables as needed

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check `package.json` for correct dependencies
   - Ensure all imports are correct
   - Check for syntax errors

2. **Environment Variables**
   - Verify all variables are set in Vercel dashboard
   - Check variable names match your code
   - Ensure no extra spaces or quotes

3. **Database Connection**
   - Verify MongoDB connection string
   - Check network access (IP whitelist)
   - Ensure database exists

4. **Function Timeouts**
   - Optimize database queries
   - Use connection pooling
   - Consider function timeout limits

### Debugging

1. **Check Vercel Logs**
   - Go to Functions tab in dashboard
   - Click on function to see logs
   - Look for error messages

2. **Local Testing**
   - Test with production environment variables
   - Use `vercel dev` for local testing
   - Check for environment-specific issues

3. **Database Issues**
   - Test database connection locally
   - Check MongoDB Atlas logs
   - Verify connection string format

## Performance Optimization

1. **Database Optimization**
   - Use indexes on frequently queried fields
   - Implement connection pooling
   - Optimize queries

2. **Function Optimization**
   - Minimize cold start times
   - Use efficient data structures
   - Implement caching where appropriate

3. **File Uploads**
   - Use Cloudinary for production
   - Implement file size limits
   - Optimize image processing

## Security Considerations

1. **Environment Variables**
   - Never commit secrets to Git
   - Use strong, unique secrets
   - Rotate secrets regularly

2. **API Security**
   - Implement rate limiting
   - Validate all inputs
   - Use HTTPS only

3. **Database Security**
   - Use strong passwords
   - Enable network security
   - Regular backups

## Support

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Vercel Community**: [github.com/vercel/vercel/discussions](https://github.com/vercel/vercel/discussions)
- **MongoDB Atlas**: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)

## Next Steps

After successful deployment:

1. **Set up CI/CD** for automatic deployments
2. **Configure monitoring** and alerting
3. **Set up staging environment** for testing
4. **Implement backup strategies**
5. **Plan for scaling** as your application grows
