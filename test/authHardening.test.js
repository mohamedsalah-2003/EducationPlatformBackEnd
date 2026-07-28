import test from "node:test";
import assert from "node:assert/strict";
import { userModel } from "../connections/models/user.model.js";
import { revokedTokenModel } from "../connections/models/revokedToken.model.js";
import userRouter from "../src/modules/user/user.routes.js";
import { isAuth } from "../src/middelwares/auth.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/services/passwords.js";
import {
  assertLoginAllowed,
  evaluateLoginThrottle,
  getLoginThrottleSubjects,
} from "../src/services/loginThrottle.js";
import {
  isTokenRevoked,
  revokeAccessToken,
} from "../src/services/tokenRevocation.js";
import {
  generateAccessToken,
  verifyToken,
} from "../src/utils/tokenFunction.js";

test("password hashing and comparison use asynchronous bcrypt APIs", async () => {
  const password = "StrongPassword1!";
  const hashPromise = hashPassword(password);

  assert.equal(typeof hashPromise?.then, "function");

  const hash = await hashPromise;
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("WrongPassword1!", hash), false);
});

test("access tokens contain revocable session identifiers and versions", () => {
  const signature = "test-jwt-secret";
  const token = generateAccessToken({
    user: {
      _id: "user-1",
      email: "student@example.com",
      username: "Student",
      role: "User",
      tokenVersion: 3,
    },
    signature,
  });
  const decoded = verifyToken({ token, signature });

  assert.equal(decoded._id, "user-1");
  assert.equal(decoded.tokenVersion, 3);
  assert.match(decoded.jti, /^[0-9a-f-]{36}$/i);
});

test("login throttling blocks account and IP subjects within the window", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const subjects = [
    { id: "account:test", type: "account", limit: 3 },
    { id: "ip:test", type: "ip", limit: 10 },
  ];
  const attempts = [
    new Date(now.getTime() - 30_000),
    new Date(now.getTime() - 20_000),
    new Date(now.getTime() - 10_000),
  ];
  const status = evaluateLoginThrottle({
    subjects,
    records: [{ _id: "account:test", attempts }],
    now,
    windowMs: 60_000,
  });

  assert.equal(status.limited, true);
  assert.equal(status.subject, "account");
  assert.equal(status.retryAfter, 30);

  const hashedSubjects = getLoginThrottleSubjects({
    email: "Student@Example.com",
    ip: "127.0.0.1",
  });
  assert.equal(
    hashedSubjects.some(({ id }) => id.includes("student@example.com")),
    false
  );
});

test("blocked login attempts return a 429 error with retry timing", async () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const subjects = getLoginThrottleSubjects({
    email: "student@example.com",
    ip: "127.0.0.1",
  });
  const attempts = Array.from(
    { length: subjects[0].limit },
    (_, index) => new Date(now.getTime() - (index + 1) * 1000)
  );
  const model = {
    find() {
      return {
        lean: async () => [{ _id: subjects[0].id, attempts }],
      };
    },
  };

  await assert.rejects(
    assertLoginAllowed({
      email: "student@example.com",
      ip: "127.0.0.1",
      model,
      now,
    }),
    (error) =>
      error?.status === 429 &&
      error?.code === "LOGIN_RATE_LIMITED" &&
      error?.retryAfter > 0
  );
});

test("logout revocation persists only the token ID until token expiry", async () => {
  let update;
  const model = {
    updateOne(filter, operation, options) {
      update = { filter, operation, options };
      return Promise.resolve();
    },
    exists(filter) {
      return Promise.resolve(filter._id === "revoked-id");
    },
  };

  await revokeAccessToken({
    decodedToken: { jti: "revoked-id", exp: 2_000_000_000 },
    userId: "user-1",
    model,
    now: new Date("2026-07-28T12:00:00.000Z"),
  });

  assert.deepEqual(update.filter, { _id: "revoked-id" });
  assert.equal(update.options.upsert, true);
  assert.equal(
    await isTokenRevoked({ jwtId: "revoked-id", model }),
    true
  );
});

test("authentication failures use 401 and revoked tokens are rejected", async () => {
  let missingTokenError;
  await isAuth()(
    { headers: {} },
    {},
    (error) => {
      missingTokenError = error;
    }
  );

  assert.equal(missingTokenError?.status, 401);
  assert.equal(missingTokenError?.code, "AUTHENTICATION_REQUIRED");

  const originalFindById = userModel.findById;
  const originalRevokedExists = revokedTokenModel.exists;
  const token = generateAccessToken({
    user: {
      _id: "user-1",
      email: "student@example.com",
      username: "Student",
      role: "User",
      tokenVersion: 0,
    },
  });

  try {
    userModel.findById = async () => ({
      _id: "user-1",
      tokenVersion: 0,
    });
    revokedTokenModel.exists = async () => ({ _id: "revoked" });

    let revokedError;
    await isAuth()(
      { headers: { authorization: `Bearer ${token}` } },
      {},
      (error) => {
        revokedError = error;
      }
    );

    assert.equal(revokedError?.status, 401);
    assert.equal(revokedError?.code, "TOKEN_REVOKED");
  } finally {
    userModel.findById = originalFindById;
    revokedTokenModel.exists = originalRevokedExists;
  }
});

test("authenticated logout route is registered", () => {
  const logoutRoute = userRouter.stack.find(
    (layer) => layer.route?.path === "/logout"
  );

  assert.ok(logoutRoute);
  assert.equal(logoutRoute.route.methods.post, true);
});
