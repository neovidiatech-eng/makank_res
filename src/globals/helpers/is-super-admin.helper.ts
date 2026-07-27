import { RolesKeys } from 'src/_modules/authorization/providers/roles';

/**
 * True only for the genuine, seeded super-admin role (the `default` Admin role),
 * which is allowed to bypass per-resource permission checks.
 *
 * Custom roles created from the dashboard share `roleKey === 'Admin'` (so they
 * live on the admin surface) but are NOT `default` — they must be constrained to
 * exactly the permissions assigned to them and must never inherit full
 * super-admin access just because they carry the Admin role key.
 */
export function isSuperAdmin(user?: CurrentUser): boolean {
  return (
    user?.Role?.roleKey === RolesKeys.ADMIN && user?.Role?.default === true
  );
}
