// @ts-nocheck
export type FirebaseServerConfig = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

export const getFirebaseServerConfig = (): FirebaseServerConfig | null => {
  if (!process.env.FIREBASE_PROJECT_ID) {
    return null;
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  };
};

