import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { localUploadRoot } from "@/lib/runtime-config";
import type { StorageProvider, StoredObject } from "@/storage/contracts";

export class LocalDevStorageProvider implements StorageProvider {
  readonly name = "local-dev-storage";

  async upload(input: { file: File; objectPath: string }): Promise<StoredObject> {
    const targetPath = join(localUploadRoot, input.objectPath.replace(/\//g, "\\"));
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, Buffer.from(await input.file.arrayBuffer()));

    return {
      storageProvider: this.name,
      storageBucket: "local-dev",
      objectPath: input.objectPath,
    };
  }

  async delete(input: { storageBucket: string; objectPath: string }): Promise<void> {
    const targetPath = join(localUploadRoot, input.objectPath.replace(/\//g, "\\"));
    await rm(targetPath, { force: true });
  }

  async createSignedDownloadUrl(_input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string | null> {
    return null;
  }
}