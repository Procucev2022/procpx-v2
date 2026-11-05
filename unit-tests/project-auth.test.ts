import { prisma } from '../src/lib/prisma';
import { getUserProjectAccessFilter, isUserAuthorizedForProject } from '../src/lib/project-auth';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    projectTeam: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
  },
}));

const projectTeam = prisma.projectTeam as unknown as { findFirst: jest.Mock };
const project = prisma.project as unknown as { findFirst: jest.Mock };

describe('getUserProjectAccessFilter', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each(['SUPER_ADMIN', 'CLIENT_ADMIN'])('returns tenant-wide scope for %s without assignment queries', async (role) => {
    await expect(getUserProjectAccessFilter('user-1', role, 'tenant-1')).resolves.toBeNull();
    expect(projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('preserves tenant-wide scope when there are no active assignments', async () => {
    projectTeam.findFirst.mockResolvedValue(null);
    await expect(getUserProjectAccessFilter('user-1', 'PROJECT_USER', 'tenant-1')).resolves.toBeNull();
    expect(projectTeam.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true, project: { tenantId: 'tenant-1' } },
      select: { id: true },
    });
  });

  it('returns relation predicates for assignments, project owners, and creators', async () => {
    projectTeam.findFirst.mockResolvedValue({ id: 'assignment-1' });
    await expect(getUserProjectAccessFilter('user-1', 'PROJECT_USER', 'tenant-1')).resolves.toEqual({
      OR: [
        { team: { some: { userId: 'user-1', active: true } } },
        { projectOwner: 'user-1' },
        { createdBy: 'user-1' },
      ],
    });
  });
});

describe('isUserAuthorizedForProject', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each(['SUPER_ADMIN', 'CLIENT_ADMIN'])('grants tenant-wide role %s without querying assignments', async (role) => {
    await expect(isUserAuthorizedForProject('user-1', role, 'project-1', 'tenant-1')).resolves.toBe(true);
    expect(projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('allows general scope without a project identifier', async () => {
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', null, 'tenant-1')).resolves.toBe(true);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', undefined, 'tenant-1')).resolves.toBe(true);
    expect(projectTeam.findFirst).not.toHaveBeenCalled();
  });

  it('allows tenant-wide users without a project lookup', async () => {
    projectTeam.findFirst.mockResolvedValue(null);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-1', 'tenant-1')).resolves.toBe(true);
    expect(project.findFirst).not.toHaveBeenCalled();
  });

  it('checks a project using a tenant-scoped relation filter', async () => {
    projectTeam.findFirst.mockResolvedValue({ id: 'assignment-1' });
    project.findFirst.mockResolvedValue({ id: 'project-1' });
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-1', 'tenant-1')).resolves.toBe(true);
    expect(project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1', tenantId: 'tenant-1',
        OR: [
          { team: { some: { userId: 'user-1', active: true } } },
          { projectOwner: 'user-1' },
          { createdBy: 'user-1' },
        ],
      },
      select: { id: true },
    });
  });

  it('rejects an unrelated project when the user has active assignments', async () => {
    projectTeam.findFirst.mockResolvedValue({ id: 'assignment-1' });
    project.findFirst.mockResolvedValue(null);
    await expect(isUserAuthorizedForProject('user-1', 'PROJECT_USER', 'project-2', 'tenant-1')).resolves.toBe(false);
  });
});
