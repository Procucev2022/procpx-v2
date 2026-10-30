// lib/storage.ts - Uploaded file storage
// Local dev writes to the uploads/ folder and stores the absolute path.
// On Cloudflare Workers files go to the R2 binding `UPLOADS` and are stored as `r2://<key>`.
import path from 'path';
import { isCloudflareWorker } from './runtime';
import { R2_PREFIX, LOCAL_UPLOADS_DIRECTORY } from './storage.constants';
import type { UploadBucket } from '@app-types/lib/storage.types';

function getBucket(): UploadBucket {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require('@opennextjs/cloudflare') as typeof import('@opennextjs/cloudflare');
  const bucket = (getCloudflareContext().env as unknown as { UPLOADS?: UploadBucket }).UPLOADS;
  if (!bucket) throw new Error('File storage is not configured: the R2 bucket binding UPLOADS is missing.');
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
  const dir = path.join(process.cwd(), LOCAL_UPLOADS_DIRECTORY, ...segments);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, data);
  return filePath;
}

/** Reads a file previously saved with saveUpload. */
export async function readUpload(ref: string): Promise<Buffer> {
  if (ref.startsWith(R2_PREFIX)) {
    const object = await getBucket().get(ref.slice(R2_PREFIX.length));
    if (!object) throw new Error('Uploaded file not found in storage.');
    return Buffer.from(await object.arrayBuffer());
  }

  if (isCloudflareWorker()) throw new Error('This file was uploaded to a local server and is not available here.');
  const { readFile } = await import('fs/promises');
  return readFile(ref);
}
