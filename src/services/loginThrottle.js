import { createHmac } from "node:crypto";
import { loginThrottleModel } from "../../connections/models/loginThrottle.model.js";
import { AppError } from "../utils/errorHandeling.js";

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const LOGIN_THROTTLE_WINDOW_MS =
  positiveInteger(process.env.LOGIN_THROTTLE_WINDOW_MINUTES, 15) * 60 * 1000;
export const LOGIN_ACCOUNT_ATTEMPT_LIMIT = positiveInteger(
  process.env.LOGIN_ACCOUNT_ATTEMPT_LIMIT,
  5
);
export const LOGIN_IP_ATTEMPT_LIMIT = positiveInteger(
  process.env.LOGIN_IP_ATTEMPT_LIMIT,
  25
);

const throttleSecret = () =>
  process.env.LOGIN_THROTTLE_SECRET || process.env.JWT_SECRET;

const subjectId = (type, value) =>
  `${type}:${createHmac("sha256", throttleSecret())
    .update(String(value ?? "").trim().toLowerCase())
    .digest("hex")}`;

export const getLoginThrottleSubjects = ({ email, ip }) => [
  {
    id: subjectId("account", email),
    limit: LOGIN_ACCOUNT_ATTEMPT_LIMIT,
    type: "account",
  },
  {
    id: subjectId("ip", ip || "unknown"),
    limit: LOGIN_IP_ATTEMPT_LIMIT,
    type: "ip",
  },
];

const activeAttempts = (attempts, cutoff) =>
  (attempts ?? [])
    .map((attempt) => new Date(attempt))
    .filter((attempt) => !Number.isNaN(attempt.getTime()) && attempt >= cutoff)
    .sort((left, right) => left - right);

export const evaluateLoginThrottle = ({
  subjects,
  records,
  now = new Date(),
  windowMs = LOGIN_THROTTLE_WINDOW_MS,
}) => {
  const cutoff = new Date(now.getTime() - windowMs);
  const recordsById = new Map(
    records.map((record) => [record._id.toString(), record])
  );

  for (const subject of subjects) {
    const attempts = activeAttempts(
      recordsById.get(subject.id)?.attempts,
      cutoff
    );

    if (attempts.length >= subject.limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((attempts[0].getTime() + windowMs - now.getTime()) / 1000)
      );
      return { limited: true, retryAfter, subject: subject.type };
    }
  }

  return { limited: false, retryAfter: 0, subject: null };
};

export const assertLoginAllowed = async ({
  email,
  ip,
  model = loginThrottleModel,
  now = new Date(),
} = {}) => {
  const subjects = getLoginThrottleSubjects({ email, ip });
  const records = await model
    .find({ _id: { $in: subjects.map(({ id }) => id) } })
    .lean();
  const status = evaluateLoginThrottle({ subjects, records, now });

  if (status.limited) {
    const error = new AppError(
      "Too many login attempts. Try again later.",
      429,
      "LOGIN_RATE_LIMITED"
    );
    error.retryAfter = status.retryAfter;
    throw error;
  }
};

export const recordLoginFailure = async ({
  email,
  ip,
  model = loginThrottleModel,
  now = new Date(),
} = {}) => {
  const cutoff = new Date(now.getTime() - LOGIN_THROTTLE_WINDOW_MS);
  const expiresAt = new Date(now.getTime() + LOGIN_THROTTLE_WINDOW_MS);
  const subjects = getLoginThrottleSubjects({ email, ip });

  await Promise.all(
    subjects.map(({ id }) =>
      model.updateOne(
        { _id: id },
        [
          {
            $set: {
              attempts: {
                $concatArrays: [
                  {
                    $filter: {
                      input: { $ifNull: ["$attempts", []] },
                      as: "attempt",
                      cond: { $gte: ["$$attempt", cutoff] },
                    },
                  },
                  [now],
                ],
              },
              expiresAt,
            },
          },
        ],
        { upsert: true }
      )
    )
  );
};

export const clearAccountLoginFailures = ({
  email,
  model = loginThrottleModel,
} = {}) => {
  const [accountSubject] = getLoginThrottleSubjects({ email, ip: "unused" });
  return model.deleteOne({ _id: accountSubject.id });
};
