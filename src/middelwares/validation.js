// middlewares/validation.js
import joi from 'joi';
import { removeUploadedFile } from '../utils/uploadCleanup.js';

export const generalFields = {
  email: joi
    .string()
    .email({ tlds: { allow: false } }) // allow any domain
    .required()
    .messages({
      'string.base': 'Email must be a string',
      'string.empty': 'Email is required',
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required',
    }),

  password: joi
    .string()
    .min(6)
    .max(30)
    .pattern(new RegExp('^[a-zA-Z0-9@#$%^&*!]+$'))
    .required()
    .messages({
      'string.base': 'Password must be a string',
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password must be at most 30 characters',
      'string.pattern.base':
        'Password must contain only letters, numbers, or special characters (@#$%^&*! etc.)',
      'any.required': 'Password is required',
    }),

  id: joi
    .string()
    .length(24)
    .hex()
    .required()
    .messages({
      'string.base': 'ID must be a string',
      'string.length': 'ID must be 24 characters',
      'string.hex': 'ID must be a valid hexadecimal',
      'any.required': 'ID is required',
    }),
};

// validationCoreFunction to apply Joi schemas
export const validationCoreFunction = (schema) => {
  const validateRequest = async (req, res, next) => {
    const validationResults = [];
    const validatedValues = {};

    for (const source of ['body', 'query', 'params']) {
      if (!schema[source]) continue;

      const { error, value } = schema[source].validate(req[source] ?? {}, {
        abortEarly: false,
        convert: true,
        stripUnknown: false,
      });
      if (error) {
        validationResults.push(...error.details);
      } else {
        validatedValues[source] = value;
      }
    }

    if (validationResults.length > 0) {
      await removeUploadedFile(req.file);
      return res.status(400).json({
        message: 'Validation Error',
        code: 'VALIDATION_ERROR',
        errors: validationResults.map((err) => err.message),
      });
    }

    Object.entries(validatedValues).forEach(([source, value]) => {
      req[source] = value;
    });
    next();
  };

  validateRequest.validationSchema = schema;
  return validateRequest;
};
