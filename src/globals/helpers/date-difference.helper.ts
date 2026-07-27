import {
  differenceInDays,
  differenceInMonths,
  differenceInYears,
} from 'date-fns';

export function getDateDifference(startDate: Date): string {
  // Calculate differences
  const years = differenceInYears(new Date(), startDate);
  const months = differenceInMonths(new Date(), startDate) % 12;
  const days = differenceInDays(new Date(), startDate) % 30;
  // Format as "Y.M D H:M:S" (floating-point for years + months)
  return `${years}.${months < 10 ? '0' + months : months}${days}`;
}

export function getDateDifferenceInYears(startDate: Date): number {
  // Calculate differences
  const years = differenceInYears(startDate, new Date());

  // Format as "Y.M D H:M:S" (floating-point for years + months)
  return years || 0;
}
