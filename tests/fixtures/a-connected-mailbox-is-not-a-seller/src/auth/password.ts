import bcrypt from 'bcrypt';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function tenantScope(organizationId: string) {
  return { where: { organizationId } };
}
