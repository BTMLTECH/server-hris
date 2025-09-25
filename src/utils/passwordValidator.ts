// utils/passwordValidator.ts

import { IUser } from '../models/user.model';
import { IActivationCode } from '../types/auth';
import jwt, { Secret } from 'jsonwebtoken';

export interface PasswordConfig {
  minLength?: number;
  requireUppercase?: boolean;
  requireNumber?: boolean;
  requireSpecialChar?: boolean;
}

const validatePassword = (password: string, config: PasswordConfig) => {
  // Set defaults if not provided
  const minLength = config.minLength || 8;
  const uppercaseRegex = config.requireUppercase ? /[A-Z]/ : null;
  const numberRegex = config.requireNumber ? /\d/ : null;
  const specialCharRegex = config.requireSpecialChar ? /[!@#$%^&*]/ : null;

  // Check for minimum length
  if (password.length < minLength) {
    return false; // Password is too short
  }

  // Check for uppercase letter if required
  if (uppercaseRegex && !uppercaseRegex.test(password)) {
    return false; // Password must contain at least one uppercase letter
  }

  // Check for number if required
  if (numberRegex && !numberRegex.test(password)) {
    return false; // Password must contain at least one number
  }

  // Check for special character if required
  if (specialCharRegex && !specialCharRegex.test(password)) {
    return false; // Password must contain at least one special character
  }

  return true;
};

export const generateRandomPassword = (length: number) => {
  // const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const chars = '0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const createActivationLink = (token: Secret): string => {
  return `http://staging-hris.btmlimited.net/set-password?token=${token}`;
};

const createActivationToken = (user: IUser): IActivationCode => {
  // const activationCode = Math.floor(1000 + Math.random() * 900000).toString();
  const activationCode = generateRandomPassword(12);

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.JWT_SECRET as Secret,
    { expiresIn: '7d' },
  );

  return { activationCode, token };
};

// This is the existing accessToken function you have
const accessToken = (user: IUser): IActivationCode => {
  const activationCode = generateRandomPassword(12);

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACCESS_TOKEN as Secret,
    { expiresIn: '7d' },
  );

  return { activationCode, token };
};

export { createActivationToken, accessToken, createActivationLink, validatePassword };
