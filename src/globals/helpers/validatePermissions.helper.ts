export function validatePermissions(
  requiredPermissions: string,
  userPermissions: {
    prefix: string;
    method: string;
  }[],
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  const reqLower = requiredPermissions.toLowerCase();
  const lastUnderscoreIndex = reqLower.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) {
    return false;
  }

  const reqPrefix = reqLower.substring(0, lastUnderscoreIndex);
  const reqMethod = reqLower.substring(lastUnderscoreIndex + 1);

  const hasPermission = userPermissions.some((perm) => {
    const permPrefix = perm.prefix?.toLowerCase();
    const permMethod = perm.method?.toLowerCase();
    return (
      permPrefix === reqPrefix &&
      (permMethod === reqMethod || permMethod === 'manage')
    );
  });

  return !!hasPermission;
}
