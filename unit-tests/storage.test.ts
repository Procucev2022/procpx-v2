import path from 'path';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { deleteUpload, readUpload, saveUpload } from '../src/lib/storage';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';
import { interpolateUiString } from '../src/lib/i18n';
import { isCloudflareWorker } from '../src/lib/runtime';

jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn(), readFile: jest.fn(), unlink: jest.fn() }));
jest.mock('../src/lib/runtime', () => ({ isCloudflareWorker: jest.fn() }));
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: jest.fn() }));

const onWorker = isCloudflareWorker as jest.Mock;
const cloudflareContext = getCloudflareContext as jest.Mock;
const bucket = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };

describe('upload storage', () => {
  const originalUploadDir = process.env.UPLOAD_DIR;

  afterAll(() => {
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_DIR = './uploads';
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

  it('writes local uploads under the configured UPLOAD_DIR', async () => {
    process.env.UPLOAD_DIR = 'custom-files';
    const ref = await saveUpload(['tenant-1'], 'file.xlsx', Buffer.from('boq'));
    expect(ref).toBe(path.join(process.cwd(), 'custom-files', 'tenant-1', 'file.xlsx'));
  });

  it('refuses local uploads when UPLOAD_DIR is not set', async () => {
    delete process.env.UPLOAD_DIR;
    await expect(saveUpload(['tenant-1'], 'file.xlsx', Buffer.from('boq'))).rejects.toThrow(interpolateUiString(UI_STRINGS.libEnv.missingRequiredSettings, { names: 'UPLOAD_DIR' }));
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('reads local uploads from disk', async () => {
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('local'));
    await expect(readUpload('/srv/uploads/file.xlsx')).resolves.toEqual(Buffer.from('local'));
    expect(readFile).toHaveBeenCalledWith('/srv/uploads/file.xlsx');
  });

  it('deletes local upload files only inside the requested tenant/project directory', async () => {
    const reference = path.join(process.cwd(), 'uploads', 'tenant-1', 'project-1', 'file.xlsx');
    await deleteUpload(reference, ['tenant-1', 'project-1']);
    expect(unlink).toHaveBeenCalledWith(reference);

    await expect(deleteUpload('/tmp/file.xlsx', ['tenant-1', 'project-1']))
      .rejects.toThrow(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);
    await expect(deleteUpload(reference, ['tenant-1', '..']))
      .rejects.toThrow(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);
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

  it('deletes R2 uploads only under the requested prefix', async () => {
    await deleteUpload('r2://tenant-1/project-1/file.xlsx', ['tenant-1', 'project-1']);
    expect(bucket.delete).toHaveBeenCalledWith('tenant-1/project-1/file.xlsx');
    await deleteUpload('r2://shared/file.xlsx');
    expect(bucket.delete).toHaveBeenLastCalledWith('shared/file.xlsx');
    await expect(deleteUpload('r2://tenant-2/file.xlsx', ['tenant-1', 'project-1']))
      .rejects.toThrow(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);

    const deleteObject = bucket.delete;
    bucket.delete = undefined as unknown as typeof bucket.delete;
    await expect(deleteUpload('r2://shared/file.xlsx')).rejects.toThrow(
      UI_STRINGS.libStorage.uploadCleanupIsNotSupportedByThisStorageBinding,
    );
    bucket.delete = deleteObject;
  });

  it('reports missing R2 objects, missing bindings and local paths on Workers', async () => {
    bucket.get.mockResolvedValue(null);
    await expect(readUpload('r2://gone.xlsx')).rejects.toThrow(UI_STRINGS.libStorage.uploadedFileNotFoundInStorage);

    onWorker.mockReturnValue(true);
    await expect(readUpload('/srv/uploads/file.xlsx')).rejects.toThrow(UI_STRINGS.libStorage.thisFileWasUploadedToALocalServerAndIsNotAvailableHere);
    await expect(deleteUpload('/srv/uploads/file.xlsx', ['tenant-1']))
      .rejects.toThrow(UI_STRINGS.libStorage.thisFileWasUploadedToALocalServerAndIsNotAvailableHere);

    cloudflareContext.mockReturnValue({ env: {} });
    await expect(saveUpload(['t'], 'f.xlsx', Buffer.from('x'))).rejects.toThrow(UI_STRINGS.libStorage.fileStorageIsNotConfiguredTheR2BucketBindingUPLOADSIsMissing);
  });
});
