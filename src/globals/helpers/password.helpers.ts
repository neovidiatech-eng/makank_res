import { UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export const validateUserPassword = (
  password: string,
  userPassword?: string,
  message: string = 'Invalid credentials',
) => {
  if (!userPassword) {
    throw new UnprocessableEntityException(message);
  }

  const isPasswordValid = bcrypt.compareSync(password, userPassword);

  if (!isPasswordValid) {
    throw new UnprocessableEntityException(message);
  }
};

// ----------------------------------------------------------------------------------------------

export const hashPassword = (password: string) => {
  const saltRounds = Number(env('HASH_SALT')) || 10;
  const HashedPassword = bcrypt.hashSync(String(password ?? ''), saltRounds);
  return HashedPassword;
};

// ----------------------------------------------------------------------------------------------
