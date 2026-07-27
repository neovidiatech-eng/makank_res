/**
 * Validates if a string is in HH:mm time format
 * @param time Time string to validate
 * @returns boolean indicating if the time format is valid
 */
export function validateTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}
