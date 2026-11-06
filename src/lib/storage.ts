// lib/storage.ts - Uploaded file storage
// Local dev writes to the uploads/ folder and stores the absolute path.
// On Cloudflare Workers files go to the R2 binding `UPLOADS` and are stored as `r2://<key>`.
import path from 'path';
import { isCloudflareWorker } from './runtime';
import { R2_PREFIX, LOCAL_UPLOADS_DIRECTORY } from './storage.constants';
import { UI_STRINGS } from './ui-strings.constants';
import type { UploadBucket } from '@app-types/lib/storage.types';

function getBucket(): UploadBucket {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  const bucket = (getCloudflareContext().env as unknown as { UPLOADS?: UploadBucket }).UPLOADS;
  if (!bucket) throw new Error(UI_STRINGS.libStorage.fileStorageIsNotConfiguredTheR2BucketBindingUPLOADSIsMissing);
  return bucket;
}

/** Saves a file under uploads/<segments...>/<fileName> and returns the stored reference. */
export async function saveUpload(segments: string[], fileName: string, data: Buffer): Promise<string> {
  if (isCloudflareWorker()) {
    const key = [...segments, fileName].join('/');
    await getBucket().put(key, new Uint8Array(data));
    return `${R2_PREFIX}${key}`;
  }

  const { mkdir, writeFile } = await import('fs/promises');
  // Uploads are written at runtime, so keep the folder out of build-time file tracing.
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), LOCAL_UPLOADS_DIRECTORY, ...segments);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, data);
  return filePath;
}

/** Removes an upload created for the supplied tenant/project path after its database write fails. */
export async function deleteUpload(ref: string, segments: string[] = []): Promise<void> {
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    throw new Error(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);
  }
  if (ref.startsWith(R2_PREFIX)) {
    const key = ref.slice(R2_PREFIX.length);
    const expectedPrefix = segments.length > 0 ? `${segments.join('/')}/` : '';
    if (expectedPrefix && !key.startsWith(expectedPrefix)) {
      throw new Error(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);
    }
    const bucket = getBucket();
    if (!bucket.delete) throw new Error(UI_STRINGS.libStorage.uploadCleanupIsNotSupportedByThisStorageBinding);
    await bucket.delete(key);
    return;
  }

  if (isCloudflareWorker()) throw new Error(UI_STRINGS.libStorage.thisFileWasUploadedToALocalServerAndIsNotAvailableHere);
  const uploadsRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), LOCAL_UPLOADS_DIRECTORY);
  const allowedRoot = path.resolve(uploadsRoot, ...segments);
  const resolvedRef = path.resolve(ref);
  const allowedPrefix = `${allowedRoot}${path.sep}`;
  if (!resolvedRef.startsWith(allowedPrefix)) {
    throw new Error(UI_STRINGS.libStorage.uploadReferenceOutsideAllowedDirectory);
  }
  const { unlink } = await import('fs/promises');
  await unlink(resolvedRef);
}

/** Reads a file previously saved with saveUpload. */
export async function readUpload(ref: string): Promise<Buffer> {
  if (ref.startsWith(R2_PREFIX)) {
    const object = await getBucket().get(ref.slice(R2_PREFIX.length));
    if (!object) throw new Error(UI_STRINGS.libStorage.uploadedFileNotFoundInStorage);
    return Buffer.from(await object.arrayBuffer());
  }

  if (isCloudflareWorker()) throw new Error(UI_STRINGS.libStorage.thisFileWasUploadedToALocalServerAndIsNotAvailableHere);
  const { readFile } = await import('fs/promises');
  return readFile(ref);
}
