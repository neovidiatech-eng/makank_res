import { BadRequestException } from '@nestjs/common';

export function calculateNewAverageRating(
  oldAverage: number,
  oldCount: number,
  newRating: number,
): number {
  if (oldCount < 0)
    throw new BadRequestException('oldCount cannot be negative');
  if (newRating < 0 || newRating > 5)
    throw new BadRequestException('newRating must be between 0 and 5');

  return (oldAverage * oldCount + newRating) / (oldCount + 1);
}
export function calculateUpdatedAverageRating(
  oldAverage: number,
  totalReviews: number,
  oldUserRating: number,
  newUserRating: number,
): number {
  if (totalReviews <= 0)
    throw new BadRequestException('totalReviews must be greater than zero');
  if (oldUserRating < 0 || oldUserRating > 5)
    throw new BadRequestException('oldUserRating must be between 0 and 5');
  if (newUserRating < 0 || newUserRating > 5)
    throw new BadRequestException('newUserRating must be between 0 and 5');

  return (
    (oldAverage * totalReviews - oldUserRating + newUserRating) / totalReviews
  );
}
export function calculateDeletedAverageRating(
  oldAverage: number,
  totalReviews: number,
  deletedRating: number,
): number {
  if (totalReviews <= 0)
    throw new BadRequestException('totalReviews must be greater than zero');
  if (deletedRating < 0 || deletedRating > 5)
    throw new BadRequestException('deletedRating must be between 0 and 5');

  // If this is the only rating, reset to 0
  if (totalReviews === 1) return 0;

  return (oldAverage * totalReviews - deletedRating) / (totalReviews - 1);
}
