export const SCHEDULE_ERRORS = {
  NAME_EXISTS: 'Schedule name already exists',
  INVALID_TIME_FORMAT: 'Invalid time format. Please use HH:mm format',
  SCHEDULE_NOT_FOUND: 'Schedule not found',
  STORE_NOT_FOUND: 'Store not found',
  INVALID_SCHEDULE: 'Invalid schedule. Closing time must be after opening time',
  OVERLAPPING_SCHEDULE: 'time is overlapping with another schedule',
} as const;
