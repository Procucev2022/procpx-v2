import { prisma } from '../src/lib/prisma';
import { createNextBoqRevision, getHighestRevisionNumber } from '../src/lib/boq-revision-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/lib/prisma', () => ({
  prisma: {
    boqRevision: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const revisionModel = prisma.boqRevision as unknown as {
  findFirst: jest.Mock;
  create: jest.Mock;
};

describe('getHighestRevisionNumber', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns -1 when there is no revision yet', async () => {
    revisionModel.findFirst.mockResolvedValue(null);
    await expect(getHighestRevisionNumber('boq-1')).resolves.toBe(-1);
    expect(revisionModel.findFirst).toHaveBeenCalledWith({
      where: { boqId: 'boq-1' },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
  });

  it('returns the highest revision number', async () => {
    revisionModel.findFirst.mockResolvedValue({ revisionNumber: 4 });
    await expect(getHighestRevisionNumber('boq-2')).resolves.toBe(4);
  });
});

describe('createNextBoqRevision', () => {
  const input = { boqId: 'boq-1', tenantId: 'tenant-1', createdById: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    revisionModel.findFirst.mockResolvedValue(null);
  });

  it('creates the first revision with defaults and nullable fields', async () => {
    const created = { id: 'revision-1', revisionNumber: 0, revisionCode: 'R0' };
    revisionModel.create.mockResolvedValue(created);

    await expect(createNextBoqRevision(input)).resolves.toBe(created);
    expect(revisionModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        boqId: 'boq-1',
        createdById: 'user-1',
        revisionNumber: 0,
        revisionCode: UI_STRINGS.common.r0,
        status: 'DRAFT',
        preparationStatus: 'DRAFT',
        budgetStatus: 'NOT_ADDED_TO_BUDGET',
        prStatus: 'PR_NOT_CREATED',
        sourceType: 'MANUAL',
        costCentreId: null,
        totalLines: 0,
        validLines: 0,
        errorLines: 0,
        warningLines: 0,
        sourceFile: null,
        sourceConfidence: null,
        uploadedAt: expect.any(Date),
      }),
    });
  });

  it('increments from the highest revision and preserves supplied values', async () => {
    revisionModel.findFirst.mockResolvedValue({ revisionNumber: 2 });
    revisionModel.create.mockResolvedValue({ id: 'revision-4' });
    const uploadedAt = new Date('2025-02-01T00:00:00.000Z');

    await createNextBoqRevision({
      ...input,
      costCentreId: 'cc-1',
      status: 'IN_REVIEW',
      preparationStatus: 'READY',
      budgetStatus: 'ADDED',
      prStatus: 'CREATED',
      sourceType: 'UPLOAD',
      sourceFile: 'boq.xlsx',
      sourceReference: 'ref-1',
      sourceConfidence: 0.9,
      originalFileName: 'original.xlsx',
      originalFilePath: '/files/original.xlsx',
      originalFileSize: 123,
      originalFileHash: 'hash',
      uploadedAt,
      columnMapping: '{}',
      notes: 'reviewed',
      totalLines: 5,
      validLines: 4,
      errorLines: 1,
      warningLines: 2,
      qualityScore: 80,
    });

    expect(revisionModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionNumber: 3,
        revisionCode: 'R3',
        costCentreId: 'cc-1',
        status: 'IN_REVIEW',
        preparationStatus: 'READY',
        budgetStatus: 'ADDED',
        prStatus: 'CREATED',
        sourceType: UI_STRINGS.appAppAuditPage.uPLOAD,
        sourceFile: 'boq.xlsx',
        sourceReference: 'ref-1',
        sourceConfidence: 0.9,
        originalFileName: 'original.xlsx',
        originalFilePath: '/files/original.xlsx',
        originalFileSize: 123,
        originalFileHash: 'hash',
        uploadedAt,
        columnMapping: '{}',
        notes: 'reviewed',
        totalLines: 5,
        validLines: 4,
        errorLines: 1,
        warningLines: 2,
        qualityScore: 80,
      }),
    });
  });

  it('retries a unique constraint race and computes the next number again', async () => {
    const conflict = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    revisionModel.findFirst
      .mockResolvedValueOnce({ revisionNumber: 0 })
      .mockResolvedValueOnce({ revisionNumber: 1 });
    revisionModel.create.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ revisionNumber: 2 });

    await expect(createNextBoqRevision(input, 2)).resolves.toMatchObject({ revisionNumber: 2 });
    expect(revisionModel.create).toHaveBeenCalledTimes(2);
  });

  it('retries the legacy unique-constraint message', async () => {
    const conflict = new Error('Unique constraint failed on the fields');
    revisionModel.findFirst
      .mockResolvedValueOnce({ revisionNumber: 0 })
      .mockResolvedValueOnce({ revisionNumber: 1 });
    revisionModel.create.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ revisionNumber: 2 });

    await expect(createNextBoqRevision(input, 2)).resolves.toMatchObject({ revisionNumber: 2 });
  });

  it('rethrows non-unique errors and the final exhausted retry', async () => {
    const databaseError = new Error('database unavailable');
    revisionModel.create.mockRejectedValueOnce(databaseError);
    await expect(createNextBoqRevision(input)).rejects.toBe(databaseError);

    const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    revisionModel.create.mockRejectedValue(conflict);
    await expect(createNextBoqRevision(input, 1)).rejects.toBe(conflict);
  });

  it('reports exhaustion when no attempts are allowed', async () => {
    await expect(createNextBoqRevision(input, 0)).rejects.toThrow(
      'Failed to allocate a unique revision number for BOQ boq-1 after 0 attempts.',
    );
  });
});
