import { BadRequestException } from '@nestjs/common';

export function toBoolean(value: string | number): boolean {
  if (typeof value === 'string') {
    value = value.toLowerCase();
    if (value === 'true' || value === '1') {
      return true;
    } else if (value === 'false' || value === '0') {
      return false;
    } else {
      throw new BadRequestException(
        `Invalid string value for boolean conversion: ${value}`,
      );
    }
  } else if (typeof value === 'number') {
    return value !== 0;
  } else {
    throw new BadRequestException(
      `Unsupported type for boolean conversion: ${typeof value}`,
    );
  }
}
