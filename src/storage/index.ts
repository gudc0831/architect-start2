import { isPostgresPrimary } from "@/lib/runtime-config";
import type { StorageProvider } from "@/storage/contracts";
import { LocalDevStorageProvider } from "@/storage/local-dev-storage";
import { SupabaseStorageProvider } from "@/storage/supabase-storage";

export const storageProvider: StorageProvider = isPostgresPrimary
  ? new SupabaseStorageProvider()
  : new LocalDevStorageProvider();
