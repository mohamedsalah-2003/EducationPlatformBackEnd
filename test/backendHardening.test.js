import test from "node:test";
import assert from "node:assert/strict";
import cloudinary from "../src/utils/cloudinaryConfigration.js";
import lessonRouter from "../src/modules/leason/leason.routes.js";
import userRouter from "../src/modules/user/user.routes.js";
import cartRouter from "../src/modules/cart/cart.routes.js";
import courseRouter from "../src/modules/couse/course.routes.js";
import assignmentRouter from "../src/modules/submittedAssignment/submittedAssignment.routes.js";
import finalTestRouter from "../src/modules/finalTest/finalTest.routes.js";
import orderRouter from "../src/modules/order/order.routes.js";
import { validatePdfUpload } from "../src/middelwares/fileValidation.js";
import {
  AppError,
  asyncHandler,
  getErrorStatus,
  globalErrorHandler,
} from "../src/utils/errorHandeling.js";
import { allowedExtensions } from "../src/utils/allowedExtentions.js";
import { withMongoTransaction } from "../src/utils/transactions.js";
import {
  createLessonVideoUploadSignature,
  verifyLessonVideoUpload,
} from "../src/services/lessonVideoUpload.js";
import {
  containsUnsafeObjectKeys,
  createCorsOptions,
  securityHeaders,
} from "../src/middelwares/requestSecurity.js";
import { createApiRateLimiter } from "../src/middelwares/rateLimit.js";
import {
  getPagination,
  getPaginationMetadata,
} from "../src/utils/pagination.js";
import { mutationSchemas } from "../src/validation/apiSchemas.js";
import {
  getMissingRuntimeConfiguration,
  validateRuntimeConfiguration,
} from "../src/config/runtimeConfig.js";

test("document uploads allow PDFs but reject JavaScript MIME types", () => {
  assert.deepEqual(allowedExtensions.Files, ["application/pdf"]);
  assert.equal(
    allowedExtensions.Files.includes("application/javascript"),
    false
  );
});

test("PDF validation checks file content, not only the declared MIME type", async () => {
  let validationError;

  await validatePdfUpload(
    {
      file: {
        mimetype: "application/pdf",
        buffer: Buffer.from("console.log('not a PDF')"),
      },
    },
    {},
    (error) => {
      validationError = error;
    }
  );

  assert.equal(validationError?.code, "INVALID_PDF");
  assert.equal(validationError?.status, 400);
});

test("asyncHandler forwards the original error to the global handler", async () => {
  const expected = new AppError("Useful validation message", 422, "INVALID");
  let forwarded;

  await asyncHandler(async () => {
    throw expected;
  })({}, {}, (error) => {
    forwarded = error;
  });

  assert.equal(forwarded, expected);
});

test("global error handling preserves operational status, message, and code", () => {
  const response = {
    statusCode: null,
    body: null,
    headersSent: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  globalErrorHandler(
    new AppError("Invalid upload", 400, "INVALID_UPLOAD"),
    {},
    response,
    () => undefined
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    message: "Invalid upload",
    code: "INVALID_UPLOAD",
  });
  assert.equal(
    getErrorStatus({ name: "MulterError", code: "LIMIT_FILE_SIZE" }),
    413
  );
});

test("transaction helper closes sessions after commit and rollback", async () => {
  let committedSessionEnded = false;
  const committed = await withMongoTransaction(
    async (session) => {
      assert.ok(session);
      return "committed";
    },
    {
      startSession: async () => ({
        withTransaction: async (work) => work(),
        endSession: async () => {
          committedSessionEnded = true;
        },
      }),
    }
  );

  assert.equal(committed, "committed");
  assert.equal(committedSessionEnded, true);

  let rolledBackSessionEnded = false;
  await assert.rejects(
    withMongoTransaction(
      async () => {
        throw new Error("rollback");
      },
      {
        startSession: async () => ({
          withTransaction: async (work) => work(),
          endSession: async () => {
            rolledBackSessionEnded = true;
          },
        }),
      }
    ),
    /rollback/
  );
  assert.equal(rolledBackSessionEnded, true);
});

test("lesson videos use signed direct-upload routes", () => {
  const paths = lessonRouter.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.ok(paths.includes("/:lessonId/video/signature"));
  assert.ok(paths.includes("/:lessonId/video/complete"));
  assert.equal(paths.includes("/:lessonId/video"), false);
});

test("direct lesson video completion verifies Cloudinary before persistence", async () => {
  const lessonId = "lesson-1";
  const publicId = `lesson/video/${lessonId}/video-1`;
  const version = 123;
  const upload = createLessonVideoUploadSignature({
    lessonId,
    timestamp: 100,
    publicId: "video-1",
  });
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    cloudinary.config().api_secret
  );

  assert.match(upload.uploadUrl, /api\.cloudinary\.com.*\/video\/upload$/);
  assert.equal("apiSecret" in upload, false);

  const video = await verifyLessonVideoUpload({
    lessonId,
    publicId,
    version,
    signature,
    getResource: async () => ({
      public_id: publicId,
      resource_type: "video",
      format: "mp4",
      bytes: 1024,
      duration: 12,
      secure_url:
        `https://res.cloudinary.com/${cloudinary.config().cloud_name}` +
        `/video/upload/v${version}/${publicId}.mp4`,
    }),
  });

  assert.equal(video.public_id, publicId);
  assert.equal(video.format, "mp4");

  await assert.rejects(
    verifyLessonVideoUpload({
      lessonId,
      publicId,
      version,
      signature: "invalid",
      getResource: async () => {
        throw new Error("must not be called");
      },
    }),
    (error) => error?.code === "INVALID_VIDEO_UPLOAD"
  );
});

test("CORS allows configured frontends and rejects unknown browser origins", () => {
  const corsOptions = createCorsOptions({
    frontendUrl: "https://student.example.com/application",
    configuredOrigins: "https://admin.example.com",
    nodeEnv: "production",
  });

  let allowed;
  corsOptions.origin("https://student.example.com", (error, result) => {
    assert.equal(error, null);
    allowed = result;
  });
  assert.equal(allowed, true);

  let blockedError;
  corsOptions.origin("https://attacker.example.com", (error) => {
    blockedError = error;
  });
  assert.equal(blockedError?.status, 403);
  assert.equal(blockedError?.code, "ORIGIN_NOT_ALLOWED");
});

test("request input protection rejects Mongo operators and unsafe field names", () => {
  assert.equal(containsUnsafeObjectKeys({ email: "student@example.com" }), false);
  assert.equal(containsUnsafeObjectKeys({ $where: "dangerous" }), true);
  assert.equal(containsUnsafeObjectKeys({ "profile.name": "student" }), true);
  assert.equal(
    containsUnsafeObjectKeys(
      JSON.parse('{"profile":{"constructor":{"prototype":{}}}}')
    ),
    true
  );
});

test("security middleware sets defensive API response headers", () => {
  const headers = new Map();
  let nextCalled = false;

  securityHeaders(
    { secure: false },
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy"), /default-src 'none'/);
  assert.equal(nextCalled, true);
});

test("every application mutation route has an explicit validation schema", () => {
  const routers = [
    userRouter,
    cartRouter,
    courseRouter,
    lessonRouter,
    assignmentRouter,
    finalTestRouter,
    orderRouter,
  ];
  const mutationRoutes = routers.flatMap((router) =>
    router.stack.filter((layer) =>
      ["post", "patch", "put", "delete"].some(
        (method) => layer.route?.methods?.[method]
      )
    )
  );

  assert.ok(mutationRoutes.length > 0);
  for (const layer of mutationRoutes) {
    assert.equal(
      layer.route.stack.some(
        (routeLayer) => routeLayer.handle.validationSchema
      ),
      true,
      `Missing validation for ${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`
    );
  }
});

test("course mutation validation converts safe values and rejects unknown input", () => {
  const valid = mutationSchemas.courseCreate.body.validate({
    title: "Production course",
    description: "A validated course",
    price: "125.50",
    schedules: [{ day: "Monday", time: "10:00 AM" }],
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.price, 125.5);

  const invalid = mutationSchemas.courseCreate.body.validate({
    title: "Course",
    description: "Description",
    price: 100,
    schedules: [{ day: "Notaday", time: "10:00" }],
    unexpected: true,
  });
  assert.ok(invalid.error);
});

test("pagination applies bounded offsets and exposes navigation metadata", () => {
  assert.deepEqual(getPagination({ page: 3, limit: 20 }), {
    page: 3,
    limit: 20,
    skip: 40,
  });
  assert.deepEqual(
    getPaginationMetadata({ page: 3, limit: 20, total: 65 }),
    {
      page: 3,
      limit: 20,
      total: 65,
      pages: 4,
      hasNextPage: true,
      hasPreviousPage: true,
    }
  );
});

test("distributed API limiter returns retry metadata after the request budget", async () => {
  let count = 0;
  const model = {
    async findOneAndUpdate() {
      count += 1;
      return { count };
    },
  };
  const limiter = createApiRateLimiter({
    windowMs: 60_000,
    maxRequests: 1,
    model,
  });
  const headers = new Map();
  const request = { method: "GET", ip: "127.0.0.1" };
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
    },
  };

  let firstError;
  await limiter(request, response, (error) => {
    firstError = error;
  });
  assert.equal(firstError, undefined);
  assert.equal(headers.get("RateLimit-Remaining"), "0");

  let secondError;
  await limiter(request, response, (error) => {
    secondError = error;
  });
  assert.equal(secondError?.status, 429);
  assert.equal(secondError?.code, "RATE_LIMIT_EXCEEDED");
  assert.ok(secondError?.retryAfter > 0);
});

test("production runtime configuration fails closed when secrets are missing", () => {
  const environment = {
    NODE_ENV: "production",
    DB_URL: "mongodb://example",
  };

  assert.ok(
    getMissingRuntimeConfiguration({ environment }).includes("JWT_SECRET")
  );
  assert.throws(
    () => validateRuntimeConfiguration({ environment }),
    /Missing required runtime configuration/
  );
});
