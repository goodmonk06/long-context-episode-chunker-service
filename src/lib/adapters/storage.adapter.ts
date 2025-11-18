// Storage adapter for handling large text files and archives

export interface IStorageAdapter {
  upload(key: string, content: string | Buffer): Promise<string>;
  download(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}

// In-memory storage (for testing and small deployments)
export class InMemoryStorageAdapter implements IStorageAdapter {
  private storage: Map<string, string> = new Map();

  async upload(key: string, content: string | Buffer): Promise<string> {
    const stringContent = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    this.storage.set(key, stringContent);
    return key;
  }

  async download(key: string): Promise<string> {
    const content = this.storage.get(key);
    if (!content) {
      throw new Error(`File not found: ${key}`);
    }
    return content;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  getUrl(key: string): string {
    return `memory://${key}`;
  }

  clear() {
    this.storage.clear();
  }

  size(): number {
    return this.storage.size;
  }
}

// File system storage (for local/single-server deployments)
import { promises as fs } from 'fs';
import path from 'path';

export class FileSystemStorageAdapter implements IStorageAdapter {
  constructor(private basePath: string) {}

  private getFullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  async upload(key: string, content: string | Buffer): Promise<string> {
    const fullPath = this.getFullPath(key);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
    return key;
  }

  async download(key: string): Promise<string> {
    const fullPath = this.getFullPath(key);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.unlink(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `file://${this.getFullPath(key)}`;
  }
}

// S3-compatible storage (stub for production)
export class S3StorageAdapter implements IStorageAdapter {
  constructor(
    private bucket: string,
    private region: string = 'us-east-1',
    private endpoint?: string
  ) {}

  async upload(key: string, content: string | Buffer): Promise<string> {
    // In a real implementation, this would use AWS SDK
    console.log(`[S3] Would upload to ${this.bucket}/${key}`);
    throw new Error('S3 adapter not implemented - add AWS SDK to use');
  }

  async download(key: string): Promise<string> {
    console.log(`[S3] Would download from ${this.bucket}/${key}`);
    throw new Error('S3 adapter not implemented - add AWS SDK to use');
  }

  async delete(key: string): Promise<void> {
    console.log(`[S3] Would delete ${this.bucket}/${key}`);
    throw new Error('S3 adapter not implemented - add AWS SDK to use');
  }

  async exists(key: string): Promise<boolean> {
    console.log(`[S3] Would check existence of ${this.bucket}/${key}`);
    throw new Error('S3 adapter not implemented - add AWS SDK to use');
  }

  getUrl(key: string): string {
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

// Global storage adapter
let storageAdapter: IStorageAdapter = new InMemoryStorageAdapter();

export function setStorageAdapter(adapter: IStorageAdapter) {
  storageAdapter = adapter;
}

export function getStorageAdapter(): IStorageAdapter {
  return storageAdapter;
}

// Convenience functions
export async function uploadFile(key: string, content: string | Buffer): Promise<string> {
  return await storageAdapter.upload(key, content);
}

export async function downloadFile(key: string): Promise<string> {
  return await storageAdapter.download(key);
}

export async function deleteFile(key: string): Promise<void> {
  await storageAdapter.delete(key);
}

export async function fileExists(key: string): Promise<boolean> {
  return await storageAdapter.exists(key);
}

export function getFileUrl(key: string): string {
  return storageAdapter.getUrl(key);
}
