// src/lib/project-auth.ts
// Project authorization and team-scope utilities for proCPX
import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';

/**
 * Returns a project relation filter for project-scoped users, or null when
 * the existing policy grants tenant-wide scope. Assignment IDs are never
 * materialized into an application-side list.
 */
export async function getUserProjectAccessFilter(
  userId: string,
  role: string,
  tenantId: string,
): Promise<Prisma.ProjectWhereInput | null> {
  if (role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN') return null;

  const activeAssignment = await prisma.projectTeam.findFirst({
    where: { userId, active: true, project: { tenantId } },
    select: { id: true },
  });

  if (!activeAssignment) return null;

  return {
    OR: [
      { team: { some: { userId, active: true } } },
      { projectOwner: userId },
      { createdBy: userId },
    ],
  };
}

/**
 * Checks if a user is authorised to access/act on a project.
 * - SUPER_ADMIN and CLIENT_ADMIN have tenant-wide scope.
 * - If projectId is null, returns true (general/global scope).
 * - If the user has active projectTeam assignments, they must be assigned to this project
 *   or be the project owner or project creator.
 * - If the user has no projectTeam assignments in the tenant, they have default tenant scope.
 */
export async function isUserAuthorizedForProject(
  userId: string,
  role: string,
  projectId: string | null | undefined,
  tenantId: string,
): Promise<boolean> {
  if (role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN') return true;
  if (!projectId) return true;

  const projectAccessFilter = await getUserProjectAccessFilter(userId, role, tenantId);
  if (!projectAccessFilter) return true;

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, ...projectAccessFilter },
    select: { id: true },
  });

  return Boolean(project);
}
