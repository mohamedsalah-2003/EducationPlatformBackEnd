const requiredProductionVariables = [
  'DB_URL',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
  'FRONTEND_URL',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'MONITORING_TOKEN',
];

export const getMissingRuntimeConfiguration = ({
  environment = process.env,
  productionOnly = true,
} = {}) => {
  if (productionOnly && environment.NODE_ENV !== 'production') return [];

  return requiredProductionVariables.filter(
    (name) => !environment[name]?.trim()
  );
};

export const validateRuntimeConfiguration = (options = {}) => {
  const missing = getMissingRuntimeConfiguration(options);
  if (missing.length) {
    throw new Error(
      `Missing required runtime configuration: ${missing.join(', ')}`
    );
  }

  if (
    (options.environment ?? process.env).NODE_ENV === 'production' &&
    (options.environment ?? process.env).JWT_SECRET.length < 32
  ) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
};
