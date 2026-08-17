import { BadRequestException } from '@nestjs/common';

export function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value == null || value === '') {
    return false;
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1') {
      return true;
    } else if (lower === 'false' || lower === '0') {
      return false;
    } else {
      throw new BadRequestException(
        `Invalid string value for boolean conversion: ${value}`,
      );
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(value);
}
