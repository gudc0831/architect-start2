export type StoredObject = {
  storageProvider: string;
  storageBucket: string;
  objectPath: string;
};

export type StoredObjectMetadata = {
  sizeBytes: number;
  mimeType: string | null;
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
  download(input: {
    storageBucket: string;
    objectPath: string;
  }): Promise<Uint8Array>;
  getObjectMetadata(input: {
    storageBucket: string;
    objectPath: string;
  }): Promise<StoredObjectMetadata | null>;
  createSignedDownloadUrl(input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string | null>;
}
