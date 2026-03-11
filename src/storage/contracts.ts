export type StoredObject = {
  storageProvider: string;
  storageBucket: string;
  objectPath: string;
};

export interface StorageProvider {
  readonly name: string;
  upload(input: {
    file: File;
    objectPath: string;
    contentType?: string | null;
  }): Promise<StoredObject>;
  delete(input: {
    storageBucket: string;
    objectPath: string;
  }): Promise<void>;
  createSignedDownloadUrl(input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string | null>;
}