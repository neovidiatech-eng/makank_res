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
  const HashedPassword = bcrypt.hashSync(password, +env('HASH_SALT'));
  return HashedPassword;
};

// ----------------------------------------------------------------------------------------------
