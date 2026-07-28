import bcrypt from "bcrypt";

const parsedSaltRounds = Number.parseInt(process.env.SALT_ROUNDS ?? "", 10);
export const PASSWORD_SALT_ROUNDS =
  Number.isInteger(parsedSaltRounds) &&
  parsedSaltRounds >= 8 &&
  parsedSaltRounds <= 15
    ? parsedSaltRounds
    : 12;

let dummyPasswordHashPromise;

export const hashPassword = (password) =>
  bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

export const verifyPassword = (password, passwordHash) =>
  bcrypt.compare(password, passwordHash);

export const getDummyPasswordHash = () => {
  dummyPasswordHashPromise ??= hashPassword(
    "invalid-account-password-timing-placeholder"
  );
  return dummyPasswordHashPromise;
};
