export function extractTimeComponents(timeString: string) {
  const [hour, minute] = timeString.split(':').map(Number);
  return { hour, minute };
}
