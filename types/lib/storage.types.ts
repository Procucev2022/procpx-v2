// Subset of the Cloudflare R2 bucket binding used by lib/storage.
export interface UploadBucket {
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete?(key: string): Promise<unknown>;
}
