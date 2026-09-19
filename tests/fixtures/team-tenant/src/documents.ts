import { prisma } from './db';

export async function listDocuments(teamId: string, userId: string) {
  const membership = await prisma.teamMember.findFirst({ where: { teamId, userId } });
  if (!membership) throw new Error('not a member of this team');

  return prisma.document.findMany({ where: { teamId } });
}
