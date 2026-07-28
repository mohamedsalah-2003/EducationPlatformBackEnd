import mongoose from "mongoose";

export const withMongoTransaction = async (
  work,
  { startSession = () => mongoose.startSession() } = {}
) => {
  const session = await startSession();

  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};
