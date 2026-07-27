import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const chunkSize = 1800;
const maxChunks = 64;
const keychainService = "com.beflow.petflow.auth";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  keychainService,
};

type StoredValueMetadata = {
  count: number;
  version: string;
};

function normalizedKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

function metadataKey(key: string) {
  return `${normalizedKey(key)}.meta`;
}

function chunkKey(key: string, version: string, index: number) {
  return `${normalizedKey(key)}.${version}.${index}`;
}

function parseMetadata(value: string | null): StoredValueMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredValueMetadata>;
    if (
      !Number.isInteger(parsed.count) ||
      !parsed.count ||
      parsed.count < 1 ||
      parsed.count > maxChunks ||
      typeof parsed.version !== "string" ||
      !/^[a-z0-9]+$/i.test(parsed.version)
    ) {
      return null;
    }
    return { count: parsed.count, version: parsed.version };
  } catch {
    return null;
  }
}

async function readMetadata(key: string) {
  return parseMetadata(
    await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions),
  );
}

async function deleteChunks(key: string, metadata: StoredValueMetadata | null) {
  if (!metadata) return;
  await Promise.all(
    Array.from({ length: metadata.count }, (_, index) =>
      SecureStore.deleteItemAsync(
        chunkKey(key, metadata.version, index),
        secureStoreOptions,
      ),
    ),
  );
}

async function storeSecureValue(key: string, value: string) {
  const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, "gs")) ?? [""];
  if (chunks.length > maxChunks) {
    throw new Error("Secure session value is too large.");
  }

  const previous = await readMetadata(key);
  const version = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const next = { count: chunks.length, version };

  try {
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(
          chunkKey(key, version, index),
          chunk,
          secureStoreOptions,
        ),
      ),
    );
    await SecureStore.setItemAsync(
      metadataKey(key),
      JSON.stringify(next),
      secureStoreOptions,
    );
  } catch (error) {
    await deleteChunks(key, next);
    throw error;
  }

  await deleteChunks(key, previous);
}

export const secureSessionStorage = {
  async getItem(key: string) {
    const metadata = await readMetadata(key);
    if (metadata) {
      const chunks = await Promise.all(
        Array.from({ length: metadata.count }, (_, index) =>
          SecureStore.getItemAsync(
            chunkKey(key, metadata.version, index),
            secureStoreOptions,
          ),
        ),
      );
      if (chunks.every((chunk): chunk is string => chunk !== null)) {
        return chunks.join("");
      }
      await deleteChunks(key, metadata);
      await SecureStore.deleteItemAsync(metadataKey(key), secureStoreOptions);
    }

    const legacyValue = await AsyncStorage.getItem(key);
    if (!legacyValue) return null;
    await storeSecureValue(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  },

  async setItem(key: string, value: string) {
    await storeSecureValue(key, value);
    await AsyncStorage.removeItem(key);
  },

  async removeItem(key: string) {
    const metadata = await readMetadata(key);
    await deleteChunks(key, metadata);
    await SecureStore.deleteItemAsync(metadataKey(key), secureStoreOptions);
    await AsyncStorage.removeItem(key);
  },
};
