# Education Platform API

Node.js and Express API for the Education Platform. It provides role-based
course administration, enrollment, assignments, final tests, feedback,
Cloudinary uploads, and Stripe Checkout.

## Requirements

- Node.js 18 or newer
- MongoDB Atlas or another replica-set deployment
- Cloudinary account
- Stripe account and signed webhook endpoint

## Local setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env` and fill the local values. Never commit
   credentials or publish demo passwords.
3. Start the API:

   ```sh
   npm run dev
   ```

4. Check liveness and database readiness:

   ```text
   GET /health/live
   GET /health/ready
   ```

## Verification

```sh
npm test
npm run migrate:course-relations:check
```

Before a production release, follow
[`PRODUCTION_OPERATIONS.md`](./PRODUCTION_OPERATIONS.md) and run the staging
verification:

```sh
npm run verify:staging
```

## Required production configuration

Use the deployment platform's encrypted secret store. See `.env.example` for
the complete variable names. Production startup fails closed when required
configuration is missing.

The Stripe webhook endpoint is:

```text
POST /order/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

## Security

- Do not put API keys, database URLs, JWT secrets, or account passwords in
  source files or documentation.
- Rotate any credential that has ever been committed, then remove it from Git
  history using an approved repository-history procedure.
- Keep frontend and backend CORS/CSP domains synchronized.
