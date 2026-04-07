import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { quarantineLocalUpload } from "@/lib/data-guard/local";
import { localUploadRoot } from "@/lib/runtime-config";
import type { StorageProvider, StoredObject } from "@/storage/contracts";

export class LocalDevStorageProvider implements StorageProvider {
  readonly name = "local-dev-storage";

  async upload(input: { file: File; objectPath: string }): Promise<StoredObject> {
    const targetPath = resolveLocalUploadPath(input.objectPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, Buffer.from(await input.file.arrayBuffer()));

    return {
      storageProvider: this.name,
      storageBucket: "local-dev",
      objectPath: input.objectPath,
    };
  }

  async delete(input: { storageBucket: string; objectPath: string }): Promise<void> {
    await quarantineLocalUpload(input.objectPath);
  }

  async download(input: { storageBucket: string; objectPath: string }): Promise<Uint8Array> {
    const sourcePath = resolveLocalUploadPath(input.objectPath);
    return new Uint8Array(await readFile(sourcePath));
  }

  async getObjectMetadata(input: { storageBucket: string; objectPath: string }) {
    try {
      const bytes = await this.download(input);
      return {
        sizeBytes: bytes.byteLength,
        mimeType: null,
      };
    } catch {
      return null;
    }
  }

  async createSignedDownloadUrl(_input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string | null> {
    return null;
  }
}

function resolveLocalUploadPath(objectPath: string) {
  const normalizedPath = objectPath.trim().replace(/[\\/]+/g, "/").replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.includes(":")) {
    throw new Error("Invalid local upload path");
  }

  const absolutePath = resolve(localUploadRoot, normalizedPath);
  const relativePath = relative(localUploadRoot, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error("Invalid local upload path");
  }

  return absolutePath;
}
