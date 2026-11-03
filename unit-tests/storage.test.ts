import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { readUpload, saveUpload } from '../src/lib/storage';
import { isCloudflareWorker } from '../src/lib/runtime';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn(), readFile: jest.fn() }));
jest.mock('../src/lib/runtime', () => ({ isCloudflareWorker: jest.fn() }));
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));

const onWorker = isCloudflareWorker as jest.Mock;
const cloudflareContext = getCloudflareContext as jest.Mock;
const bucket = { put: jest.fn(), get: jest.fn() };

describe('upload storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onWorker.mockReturnValue(false);
    cloudflareContext.mockReturnValue({ env: { UPLOADS: bucket } });
  });

  it('writes local uploads under uploads/<segments> and returns the absolute path', async () => {
    const data = Buffer.from('boq');
    const ref = await saveUpload(['tenant-1', 'project-1'], 'file.xlsx', data);

    const expectedDir = path.join(process.cwd(), 'uploads', 'tenant-1', 'project-1');
    expect(mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(path.join(expectedDir, 'file.xlsx'), data);
    expect(ref).toBe(path.join(expectedDir, 'file.xlsx'));
  });

  it('reads local uploads from disk', async () => {
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('local'));
    await expect(readUpload('/srv/uploads/file.xlsx')).resolves.toEqual(Buffer.from('local'));
    expect(readFile).toHaveBeenCalledWith('/srv/uploads/file.xlsx');
  });

  it('stores Worker uploads in R2 and returns an r2:// reference', async () => {
    onWorker.mockReturnValue(true);
    const ref = await saveUpload(['tenant-1', 'project-1', 'drawings'], 'plan.pdf', Buffer.from('pdf'));

    expect(ref).toBe('r2://tenant-1/project-1/drawings/plan.pdf');
    expect(bucket.put).toHaveBeenCalledWith('tenant-1/project-1/drawings/plan.pdf', expect.any(Uint8Array));
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('reads r2:// references from the bucket', async () => {
    bucket.get.mockResolvedValue({ arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer });
    await expect(readUpload('r2://tenant-1/file.xlsx')).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(bucket.get).toHaveBeenCalledWith('tenant-1/file.xlsx');
  });

  it('reports missing R2 objects, missing bindings and local paths on Workers', async () => {
    bucket.get.mockResolvedValue(null);
    await expect(readUpload('r2://gone.xlsx')).rejects.toThrow(UI_STRINGS.libStorage.uploadedFileNotFoundInStorage);

    onWorker.mockReturnValue(true);
    await expect(readUpload('/srv/uploads/file.xlsx')).rejects.toThrow(UI_STRINGS.libStorage.thisFileWasUploadedToALocalServerAndIsNotAvailableHere);

    cloudflareContext.mockReturnValue({ env: {} });
    await expect(saveUpload(['t'], 'f.xlsx', Buffer.from('x'))).rejects.toThrow(UI_STRINGS.libStorage.fileStorageIsNotConfiguredTheR2BucketBindingUPLOADSIsMissing);
  });
});
