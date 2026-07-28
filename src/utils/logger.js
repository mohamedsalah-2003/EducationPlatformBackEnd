const serializeError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  stack:
    process.env.NODE_ENV === 'production' ? undefined : error?.stack,
});

const writeLog = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };

  const output = `${JSON.stringify(entry)}\n`;
  if (level === 'error') {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
};

export const logInfo = (event, details) => writeLog('info', event, details);
export const logWarn = (event, details) => writeLog('warn', event, details);
export const logError = (event, error, details = {}) =>
  writeLog('error', event, {
    ...details,
    error: serializeError(error),
  });
