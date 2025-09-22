/**
 * Returns a MongoDB filter condition to exclude specific roles and inactive users.
 * @param roles - roles to exclude (default: ['hr', 'admin'])
 */
export const excludeRoles = (roles: string[] = ['hr', 'admin']) => {
  return {
    role: { $nin: roles },
    status: { $ne: 'inactive' },
  };
};
