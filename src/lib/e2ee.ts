// E2E File Encryption for Cloud Storage
// Client-side AES-256-GCM encryption for S3/R2 storage
// - Files are encrypted locally before upload
// - Keys are stored locally (never sent to server)
// - Zero-knowledge encryption

export interface EncryptionKey {
  key: Uint8Array;
  nonce: Uint8Array;
}

export interface SerializedEncryptionKey {
  keyBase64: string;
  nonceBase64: string;
}

export interface EncryptedFileInfo {
  fileId: string;
  fileName: string;
  originalSize: number;
  encryptedSize: number;
  keyBase64: string;
  nonceBase64: string;
  mimeType: string;
  uploadedAt: string;
  storageKey?: string; // Unique identifier for storage config (bucket + endpoint hash)
  folderId?: string; // Parent folder ID (null = root)
  isFavorite?: boolean; // Whether file is favorited
}

// Converts Uint8Array to URL-safe base64 string
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Converts URL-safe base64 string to Uint8Array
export function base64ToBytes(base64: string): Uint8Array {
  try {
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid base64: expected non-empty string');
    }

    // URL-decode first in case the base64 was URL-encoded
    const decodedBase64 = decodeURIComponent(base64);

    // Add back padding if needed
    const padded = decodedBase64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(decodedBase64.length / 4) * 4, '=');

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new Error(
      `Invalid base64 encoding: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Generates encryption key and nonce for AES-256-GCM
// - Key: 32 bytes (256 bits)
// - Nonce: 12 bytes (96 bits)
export function generateEncryptionKeyAndNonce(): EncryptionKey {
  return {
    key: crypto.getRandomValues(new Uint8Array(32)),
    nonce: crypto.getRandomValues(new Uint8Array(12)),
  };
}

// Serialize encryption key for storage
export function serializeEncryptionKey(
  key: EncryptionKey
): SerializedEncryptionKey {
  return {
    keyBase64: bytesToBase64(key.key),
    nonceBase64: bytesToBase64(key.nonce),
  };
}

// Strip metadata from file (EXIF, etc.)
export async function stripFileMetadata(file: File): Promise<Uint8Array> {
  try {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Only strip EXIF from JPEG files
    if (file.type === "image/jpeg" && data[0] === 0xFF && data[1] === 0xD8) {
      return stripJPEGExif(data);
    }

    return data;
  } catch (error) {
    return new Uint8Array(await file.arrayBuffer());
  }
}

// Strip EXIF from JPEG
function stripJPEGExif(data: Uint8Array): Uint8Array {
  const result: number[] = [];

  result.push(0xFF, 0xD8);

  let i = 2;
  while (i < data.length - 1) {
    if (data[i] === 0xFF && data[i + 1] !== 0x00) {
      const marker = data[i + 1];

      // APP markers (0xE0-0xEF) contain EXIF - skip
      if (marker >= 0xE0 && marker <= 0xEF) {
        const len = (data[i + 2] << 8) | data[i + 3];
        i += 2 + len;
        continue;
      }

      // COM marker - skip
      if (marker === 0xFE) {
        const len = (data[i + 2] << 8) | data[i + 3];
        i += 2 + len;
        continue;
      }

      // SOS marker - copy everything from here
      if (marker === 0xDA) {
        while (i < data.length) {
          result.push(data[i]);
          i++;
        }
        break;
      }

      // EOI marker
      if (marker === 0xD9) {
        result.push(0xFF, 0xD9);
        break;
      }

      // Keep other markers
      result.push(data[i], data[i + 1]);
      
      if (marker !== 0x00 && marker !== 0x01 && marker !== 0xD0 && marker !== 0xD1 &&
          marker !== 0xD2 && marker !== 0xD3 && marker !== 0xD4 && marker !== 0xD5 &&
          marker !== 0xD6 && marker !== 0xD7) {
        const len = (data[i + 2] << 8) | data[i + 3];
        for (let j = 0; j < len; j++) {
          result.push(data[i + 2 + j]);
        }
        i += 2 + len;
      } else {
        i += 2;
      }
    } else {
      i++;
    }
  }

  return new Uint8Array(result);
}

// Encrypts file using AES-256-GCM
export async function encryptFile(
  file: File,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as any,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const cleanedFileData = await stripFileMetadata(file);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce as any,
      },
      cryptoKey,
      cleanedFileData as any
    );

    return new Uint8Array(encryptedBuffer);
  } catch (error) {
    throw new Error(
      `File encryption failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Decrypt file using AES-256-GCM
export async function decryptFile(
  encryptedData: Uint8Array,
  keyBase64: string,
  nonceBase64: string
): Promise<ArrayBuffer> {
  try {
    if (!keyBase64 || !nonceBase64) {
      throw new Error('Missing encryption key or nonce');
    }

    const key = base64ToBytes(keyBase64);
    const nonce = base64ToBytes(nonceBase64);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as any,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce as any,
      },
      cryptoKey,
      encryptedData as any
    );

    return decryptedBuffer;
  } catch (error) {
    throw new Error(
      `File decryption failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Derive share key from password (PBKDF2, same as master key)
export async function deriveShareKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.length) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt JSON object to bytes (AES-GCM)
export async function encryptJson(obj: any, key: CryptoKey): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(obj));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

// Decrypt bytes to JSON object (AES-GCM)
export async function decryptJson(encryptedData: Uint8Array, key: CryptoKey): Promise<any> {
  const iv = encryptedData.slice(0, 12);
  const data = encryptedData.slice(12);
  const ivBuffer = new Uint8Array(iv).buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const dataBuffer = new Uint8Array(data).buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    dataBuffer
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

// Generate secure share password (24 hex chars)
export function generateSharePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Encrypt bytes using AES-GCM
export async function encryptBytes(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data as any
  );

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

// Decrypt bytes using AES-GCM
export async function decryptBytes(encryptedData: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = encryptedData.slice(0, 12);
  const data = encryptedData.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as any },
    key,
    data as any
  );

  return new Uint8Array(decrypted);
}

// Generate a unique file ID
export function generateFileId(): string {
  return crypto.randomUUID();
}

// Handle file errors
export function handleFileError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}
