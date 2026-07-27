export function generateRandomPassword(options?: {
  length?: number;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
}): string {
  // Default options
  const {
    length = 12,
    includeNumbers = true,
    includeSymbols = true,
    includeUppercase = true,
    includeLowercase = true,
  } = options || {};

  // Character sets
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';

  // Build available characters based on options
  let availableChars = '';
  if (includeLowercase) availableChars += lowercase;
  if (includeUppercase) availableChars += uppercase;
  if (includeNumbers) availableChars += numbers;
  if (includeSymbols) availableChars += symbols;

  // Fallback if no character sets are selected
  if (!availableChars) {
    availableChars = lowercase + uppercase + numbers;
  }

  // Generate password
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * availableChars.length);
    password += availableChars[randomIndex];
  }

  return password;
}
