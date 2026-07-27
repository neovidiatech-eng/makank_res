export function getRandomFloat(start: number, end: number) {
  return Math.random() * (end - start) + start;
}
export function getRandomInt(start: number, end: number) {
  return Math.floor(Math.random() * (end - start + 1)) + start;
}

export function getRandomBoolean() {
  return Math.random() < 0.5;
}

export function getRandomDate() {
  const start = new Date('2024-06-9');
  const end = new Date('2025-12-31');

  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}
