import { createRequire } from "node:module";
import { backendMode } from "@/lib/backend-mode";
import type { StorageProvider } from "@/storage/contracts";

const require = createRequire(import.meta.url);

let storageProviderInstance: StorageProvider | null = null;

function getStorageProvider(): StorageProvider {
  if (!storageProviderInstance) {
    storageProviderInstance = backendMode === "cloud"
      ? new (require("./supabase-storage").SupabaseStorageProvider as typeof import("./supabase-storage").SupabaseStorageProvider)()
      : new (require("./local-dev-storage").LocalDevStorageProvider as typeof import("./local-dev-storage").LocalDevStorageProvider)();
  }

  return storageProviderInstance;
}

export const storageProvider: StorageProvider = {
  get name() {
    return backendMode === "cloud" ? "supabase-storage" : "local-dev-storage";
  },
  async upload(input) {
    return getStorageProvider().upload(input);
  },
  async delete(input) {
    return getStorageProvider().delete(input);
  },
  async download(input) {
    return getStorageProvider().download(input);
  },
  async getObjectMetadata(input) {
    return getStorageProvider().getObjectMetadata(input);
  },
  async createSignedDownloadUrl(input) {
    return getStorageProvider().createSignedDownloadUrl(input);
  },
};
