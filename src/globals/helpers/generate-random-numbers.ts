import * as crypto from 'crypto';

export const generateRandomNumberString = (digits = 4) => {
  const randomBytes = crypto.randomBytes(20);
  const randomNumber = randomBytes.toString('hex').substring(0, 8);
  return parseInt(randomNumber, 16).toString().substring(0, digits);
};
