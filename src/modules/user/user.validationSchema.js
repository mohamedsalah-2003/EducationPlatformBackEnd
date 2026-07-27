// modules/user/user.validation.js
import joi from 'joi';
import { generalFields } from '../../middelwares/validation.js';

export const SignUpSchema = {
  body: joi
    .object({
      username: joi
        .string()
        .min(3)
        .max(30)
        .required()
        .messages({
          'string.base': 'Username must be a string',
          'string.empty': 'Username is required',
          'string.min': 'Username must be at least 3 characters',
          'string.max': 'Username must be at most 30 characters',
          'any.required': 'Username is required',
        }),

      email: generalFields.email,

      password: generalFields.password,

      cPassword: joi
        .valid(joi.ref('password'))
        .required()
        .messages({
          'any.only': 'Confirm password must match password',
          'any.required': 'Confirm password is required',
        }),

      gender: joi.string().valid('male', 'female').optional().messages({
        'any.only': 'Gender must be either "male" or "female"',
      }),

    })
    .required(),
};

export const SignInSchema = {
  body: joi
    .object({
      email: generalFields.email,
      password: generalFields.password,
    })
    .required()
    .messages({
      'any.required': 'All fields are required',
    }),
};
