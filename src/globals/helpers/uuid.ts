export function validateUUID(uuid: string) {
  const result = uuid.match(
    /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
  );

  if (result === null) {
    return false;
  }

  return true;
}
