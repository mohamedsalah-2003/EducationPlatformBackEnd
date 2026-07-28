# Production operations runbook

## Required environments

Maintain separate development, staging, and production MongoDB databases,
Stripe accounts or modes, Cloudinary folders, domains, and secrets. Never run a
migration against production before the same revision succeeds in staging.

## Release sequence

1. Rotate any credential that has ever appeared in Git history.
2. Create an on-demand MongoDB Atlas snapshot and record its restore test.
3. Deploy the backend revision to staging.
4. Run the relationship migration preview against staging:

   ```powershell
   $env:DB_URL=$env:STAGING_DB_URL
   $env:DB_NAME=$env:STAGING_DB_NAME
   npm run migrate:course-relations:check
   ```

5. If the preview reports changes, apply it and repeat the preview:

   ```powershell
   npm run migrate:course-relations
   npm run migrate:course-relations:check
   ```

6. Set `BACKUP_RESTORE_VERIFIED_AT` to the timestamp of the latest successful
   staging restore drill, then run:

   ```powershell
   npm run verify:staging
   ```

7. Exercise a complete Stripe test payment, cancellation, delayed-payment
   success, delayed-payment failure, and webhook retry in staging. Confirm that
   enrollment occurs only after a verified successful event.
8. Deploy the exact tested commit to production and monitor `/health/ready`,
   protected `/health/metrics`, error-rate logs, payment failures, and database
   latency.

## Required Stripe events

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

The endpoint URL is `https://<api-domain>/order/webhook`. Keep the signing
secret only in the deployment secret store.

## Rollback

1. Stop new frontend traffic by placing the site in maintenance mode if data
   integrity is at risk.
2. Roll the backend and frontend back to the last known-good immutable
   deployment.
3. Do not reverse an applied database migration by hand. If the new schema
   cannot be read by the old backend, restore the pre-release Atlas snapshot
   into a new database and point the rollback deployment to it.
4. Leave Stripe webhooks enabled. The payment handlers are idempotent and must
   continue receiving retries. Reconcile every Stripe payment created during
   the incident against orders and enrollments before reopening checkout.
5. Preserve request-ID logs and document the affected deployment IDs, time
   range, Stripe event IDs, and recovery actions.

## Backup policy

- Enable continuous Atlas backups for production.
- Create an on-demand snapshot before every data migration.
- Run and record a restore drill at least monthly.
- Encrypt exports, restrict restore permissions, and define retention in the
  infrastructure account rather than application code.
