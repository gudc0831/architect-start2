import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseStorageBucket } from "@/lib/supabase/config";
import type { StorageProvider, StoredObject } from "@/storage/contracts";

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase-storage";

  async upload(input: {
    file: File;
    objectPath: string;
    contentType?: string | null;
  }): Promise<StoredObject> {
    const supabase = createSupabaseAdminClient();
    const bucket = getSupabaseStorageBucket();
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const { error } = await supabase.storage.from(bucket).upload(input.objectPath, buffer, {
      contentType: input.contentType ?? undefined,
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      storageProvider: this.name,
      storageBucket: bucket,
      objectPath: input.objectPath,
    };
  }

  async delete(input: { storageBucket: string; objectPath: string }): Promise<void> {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage.from(input.storageBucket).remove([input.objectPath]);

    if (error) {
      throw new Error(error.message);
    }
  }

  async download(input: { storageBucket: string; objectPath: string }): Promise<Uint8Array> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(input.storageBucket).download(input.objectPath);

    if (error) {
      throw new Error(error.message);
    }

    return new Uint8Array(await data.arrayBuffer());
  }

  async createSignedDownloadUrl(input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(input.storageBucket)
      .createSignedUrl(input.objectPath, input.expiresInSeconds ?? 60 * 10);

    if (error) {
      return null;
    }

    return data.signedUrl;
  }
}
