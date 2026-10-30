import { prisma } from '../src/lib/prisma';
import { getUserAuthorizedProjectIds, isUserAuthorizedForProject } from '../src/lib/project-auth';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    projectTeam: { findMany: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}));

const projectTeam = prisma.projectTeam as unknown as { findMany: jest.Mock };
const project = prisma.project as unknown as { findMany: jest.Mock; findUnique: jest.Mock };

describe('isUserAuthorizedForProject', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['SUPER_ADMIN', 'CLIENT_ADMIN'])('grants tenant-wide role %s without querying assignments', async (role) => {
    await expect(isUserAuthorizedForProject('user-1', role, 'project-1')).resolves.toBe(true);
    expect(projectTeam.findMany).not.toHaveBeenCalled();
  });

  it('allows general scope without a project identifier', async () => {
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', null)).resolves.toBe(true);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', undefined)).resolves.toBe(true);
    expect(projectTeam.findMany).not.toHaveBeenCalled();
  });

  it('allows tenant users who have no active project assignments', async () => {
    projectTeam.findMany.mockResolvedValue([]);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-1')).resolves.toBe(true);
    expect(projectTeam.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true }, select: { projectId: true },
    });
    expect(project.findUnique).not.toHaveBeenCalled();
  });

  it('allows an assigned project and rejects unrelated projects', async () => {
    projectTeam.findMany.mockResolvedValue([{ projectId: 'project-1' }]);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-1')).resolves.toBe(true);

    project.findUnique.mockResolvedValue({ projectOwner: 'other', createdBy: 'other' });
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-2')).resolves.toBe(false);
    project.findUnique.mockResolvedValue(null);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-3')).resolves.toBe(false);
  });

  it.each([
    [{ projectOwner: 'user-1', createdBy: 'other' }, true],
    [{ projectOwner: 'other', createdBy: 'user-1' }, true],
    [null, false],
  ])('checks project owner/creator when no assignment matches', async (record, allowed) => {
    projectTeam.findMany.mockResolvedValue([{ projectId: 'assigned-project' }]);
    project.findUnique.mockResolvedValue(record);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-2')).resolves.toBe(allowed);
  });
});

describe('getUserAuthorizedProjectIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['SUPER_ADMIN', 'CLIENT_ADMIN'])('returns tenant-wide scope for %s', async (role) => {
    await expect(getUserAuthorizedProjectIds('user-1', role)).resolves.toBeNull();
    expect(projectTeam.findMany).not.toHaveBeenCalled();
  });

  it('returns tenant-wide scope when no assignments are configured', async () => {
    projectTeam.findMany.mockResolvedValue([]);
    await expect(getUserAuthorizedProjectIds('user-1', 'PROJECT_USER')).resolves.toBeNull();
    expect(project.findMany).not.toHaveBeenCalled();
  });

  it('combines assigned and owned project IDs without duplicates', async () => {
    projectTeam.findMany.mockResolvedValue([{ projectId: 'project-1' }, { projectId: 'project-2' }]);
    project.findMany.mockResolvedValue([{ id: 'project-2' }, { id: 'project-3' }]);

    await expect(getUserAuthorizedProjectIds('user-1', 'PROJECT_USER')).resolves.toEqual([
      'project-1', 'project-2', 'project-3',
    ]);
    expect(project.findMany).toHaveBeenCalledWith({
      where: { OR: [{ projectOwner: 'user-1' }, { createdBy: 'user-1' }] },
      select: { id: true },
    });
  });
});
