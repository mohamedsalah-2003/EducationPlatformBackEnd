import 'dotenv/config';
import mongoose from 'mongoose';
import Stripe from 'stripe';

const requiredEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

const requiredEnvironment = [
  'STAGING_API_URL',
  'STAGING_DB_URL',
  'STAGING_STRIPE_SECRET_KEY',
  'STAGING_MONITORING_TOKEN',
  'BACKUP_RESTORE_VERIFIED_AT',
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requireEnvironment = () => {
  const missing = requiredEnvironment.filter(
    (name) => !process.env[name]?.trim()
  );
  assert(
    missing.length === 0,
    `Missing staging verification configuration: ${missing.join(', ')}`
  );

  const apiUrl = new URL(process.env.STAGING_API_URL);
  assert(apiUrl.protocol === 'https:', 'STAGING_API_URL must use HTTPS');

  const backupVerifiedAt = new Date(process.env.BACKUP_RESTORE_VERIFIED_AT);
  assert(
    Number.isFinite(backupVerifiedAt.getTime()),
    'BACKUP_RESTORE_VERIFIED_AT must be an ISO date'
  );
  const backupAgeDays =
    (Date.now() - backupVerifiedAt.getTime()) / (24 * 60 * 60 * 1000);
  assert(
    backupAgeDays >= 0 && backupAgeDays <= 30,
    'A successful backup restore drill from the last 30 days is required'
  );

  return apiUrl;
};

const requestJson = async (url, options) => {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  assert(
    response.ok,
    `${url} returned ${response.status}: ${body.message ?? 'request failed'}`
  );
  return body;
};

const verifyApi = async (apiUrl) => {
  const live = await requestJson(new URL('/health/live', apiUrl));
  assert(live.status === 'ok', 'Liveness check did not report ok');

  const ready = await requestJson(new URL('/health/ready', apiUrl));
  assert(ready.status === 'ready', 'Readiness check did not report ready');

  const metrics = await requestJson(new URL('/health/metrics', apiUrl), {
    headers: {
      Authorization: `Bearer ${process.env.STAGING_MONITORING_TOKEN}`,
    },
  });
  assert(
    Number.isFinite(metrics.requests),
    'Metrics endpoint did not return request counters'
  );
};

const verifyMigrationState = async () => {
  const database = mongoose.connection.db;
  const [legacyCourses, legacySchedules, legacyLessonSubmissions] =
    await Promise.all([
      database.collection('courses').countDocuments({
        $or: [
          { lessons: { $exists: true } },
          { finalTest: { $exists: true } },
        ],
      }),
      database.collection('schedules').countDocuments({}),
      database.collection('leasons').countDocuments({
        submissions: { $exists: true },
      }),
    ]);

  assert(
    legacyCourses === 0 &&
      legacySchedules === 0 &&
      legacyLessonSubmissions === 0,
    'Legacy relationship data remains; run the course-relations migration'
  );
};

const verifyTransactionRollback = async () => {
  const marker = new mongoose.Types.ObjectId();
  const collection = mongoose.connection.db.collection(
    'stagingReadinessChecks'
  );
  const session = await mongoose.startSession();
  const rollbackMarker = new Error('EXPECTED_TRANSACTION_ROLLBACK');

  try {
    await session.withTransaction(async () => {
      await collection.insertOne(
        {
          _id: marker,
          createdAt: new Date(),
          purpose: 'transaction-rollback-verification',
        },
        { session }
      );
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  } finally {
    await session.endSession();
  }

  const persisted = await collection.findOne({ _id: marker });
  assert(!persisted, 'MongoDB transaction rollback verification failed');
};

const verifyStripeWebhook = async (apiUrl) => {
  const stripe = new Stripe(process.env.STAGING_STRIPE_SECRET_KEY);
  const expectedUrl = new URL('/order/webhook', apiUrl).toString();
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = endpoints.data.find(
    (candidate) => candidate.url === expectedUrl && candidate.status === 'enabled'
  );

  assert(endpoint, `No enabled Stripe webhook found for ${expectedUrl}`);
  const enabledEvents = new Set(endpoint.enabled_events);
  assert(
    enabledEvents.has('*') ||
      [...requiredEvents].every((event) => enabledEvents.has(event)),
    'Stripe webhook is missing one or more required Checkout events'
  );
};

const run = async () => {
  const apiUrl = requireEnvironment();

  await verifyApi(apiUrl);
  await mongoose.connect(process.env.STAGING_DB_URL, {
    serverSelectionTimeoutMS: 10_000,
    dbName: process.env.STAGING_DB_NAME || 'educationPlatform',
  });

  try {
    await verifyMigrationState();
    await verifyTransactionRollback();
    await verifyStripeWebhook(apiUrl);
  } finally {
    await mongoose.disconnect();
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'ready',
      verifiedAt: new Date().toISOString(),
      checks: [
        'api_liveness',
        'api_readiness',
        'protected_metrics',
        'migration_state',
        'transaction_rollback',
        'stripe_webhook_registration',
        'recent_backup_restore_drill',
      ],
    })}\n`
  );
};

run().catch(async (error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: 'failed',
      message: error.message,
    })}\n`
  );
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
