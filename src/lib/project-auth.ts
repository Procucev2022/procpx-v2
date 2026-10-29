// src/lib/project-auth.ts
// Project authorization and team-scope utilities for proCPX
import { prisma } from './prisma';

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
  projectId: string | null | undefined
): Promise<boolean> {
  if (role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN') return true;
  if (!projectId) return true;

  const assignments = await prisma.projectTeam.findMany({
    where: { userId, active: true },
    select: { projectId: true },
  });

  if (assignments.length === 0) {
    return true;
  }

  const allowedProjectIds = new Set(assignments.map((a) => a.projectId));
  if (allowedProjectIds.has(projectId)) {
    return true;
  }

  // Check if user is owner or creator of project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectOwner: true, createdBy: true },
  });

  if (project && (project.projectOwner === userId || project.createdBy === userId)) {
    return true;
  }

  return false;
}

/**
 * Returns the list of project IDs the user is authorized for,
 * or null if the user has tenant-wide scope.
 */
export async function getUserAuthorizedProjectIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  if (role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN') return null;

  const assignments = await prisma.projectTeam.findMany({
    where: { userId, active: true },
    select: { projectId: true },
  });

  if (assignments.length === 0) {
    return null;
  }

  const assignedIds = assignments.map((a) => a.projectId);

  // Also include projects owned or created by user
  const ownedProjects = await prisma.project.findMany({
    where: {
      OR: [{ projectOwner: userId }, { createdBy: userId }],
    },
    select: { id: true },
  });

  const allIds = Array.from(new Set([...assignedIds, ...ownedProjects.map((p) => p.id)]));
  return allIds;
}
