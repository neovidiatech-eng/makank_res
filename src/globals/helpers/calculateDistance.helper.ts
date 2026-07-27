// * Estimates the delivery price based on the distance between the user's location and store's zone points.

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3;
  const φ1 = toRad(+lat1);
  const φ2 = toRad(+lat2);
  const Δφ = toRad(+lat2 - +lat1);
  const Δλ = toRad(+lng2 - +lng1);

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Estimates the time to deliver based on the distance and average speed.
export function estimateDeliveryTime(
  distance: number,
  speed: number = 50,
): number {
  return distance / speed;
}

//  Converts a value from degrees to radians.
export function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
