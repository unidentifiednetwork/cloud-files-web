// Encrypted Manifest System
// 
// Stores file metadata (including encryption keys) in R2 as an encrypted manifest.
// The manifest is encrypted with a master key derived from user's password.
// 
// Flow:
// 1. User enters encryption password → derive master key via PBKDF2
// 2. Download manifest from R2 → decrypt with master key
// 3. Cache manifest in memory (sessionStorage for tab persistence)
// 4. On file upload → update manifest → encrypt → upload to R2

import { EncryptedFileInfo } from "./e2ee";
import { StorageConfig } from "./settings";
import { uploadToStorage, downloadFromStorage } from "./storage-client";
import { clearNotesCache } from "./notes";
import { clearCalendarCache } from "./calendar";

const MANIFEST_KEY = ".manifest.enc";
const MANIFEST_SALT_KEY = ".manifest.salt";
const SESSION_CACHE_KEY = "manifest_cache";
const SESSION_UNLOCKED_KEY = "manifest_unlocked";

export interface Folder {
  id: string;
  name: string;
  parentId?: string; // Parent folder ID (undefined = root)
  createdAt: string;
  color?: string; // Optional folder color
}

export interface Manifest {
  version: number;
  files: EncryptedFileInfo[];
  folders: Folder[];
  createdAt: string;
  updatedAt: string;
}

// In-memory cache
let manifestCache: Manifest | null = null;
let masterKeyCache: CryptoKey | null = null;
let saltCache: Uint8Array | null = null;

// Derive master key from password using PBKDF2
async function deriveMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Generate random salt
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

// Encrypt manifest with master key
async function encryptManifest(manifest: Manifest, masterKey: CryptoKey): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(manifest));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    data
  );

  // Prepend IV to encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

// Decrypt manifest with master key
async function decryptManifest(encryptedData: Uint8Array, masterKey: CryptoKey): Promise<Manifest> {
  const iv = encryptedData.slice(0, 12);
  const data = encryptedData.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    masterKey,
    data
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

// Create empty manifest
function createEmptyManifest(): Manifest {
  return {
    version: 1,
    files: [],
    folders: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Save manifest cache to sessionStorage (survives page refresh within tab)
function saveToSessionCache(manifest: Manifest): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(manifest));
  }
}

// Load manifest from sessionStorage
function loadFromSessionCache(): Manifest | null {
  if (typeof sessionStorage === "undefined") return null;
  
  try {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Check if manifest is unlocked in this session
export function isManifestUnlocked(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true" && manifestCache !== null;
}

// Check if manifest exists in storage
export async function manifestExists(config: StorageConfig): Promise<boolean> {
  try {
    await downloadFromStorage(config, MANIFEST_SALT_KEY);
    return true;
  } catch {
    return false;
  }
}

// Initialize new manifest with password
// Called when user sets up encryption for the first time
export async function initializeManifest(
  config: StorageConfig,
  password: string
): Promise<void> {
  const salt = generateSalt();
  const masterKey = await deriveMasterKey(password, salt);
  const manifest = createEmptyManifest();

  // Upload salt (unencrypted)
  await uploadToStorage(config, MANIFEST_SALT_KEY, salt);

  // Encrypt and upload manifest
  const encryptedManifest = await encryptManifest(manifest, masterKey);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);

  // Cache in memory
  manifestCache = manifest;
  masterKeyCache = masterKey;
  saltCache = salt;
  
  saveToSessionCache(manifest);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
  }
}

// Unlock manifest with password
// Downloads and decrypts the manifest from R2
export async function unlockManifest(
  config: StorageConfig,
  password: string
): Promise<Manifest> {
  // Download salt
  const salt = await downloadFromStorage(config, MANIFEST_SALT_KEY);
  
  // Derive master key
  const masterKey = await deriveMasterKey(password, salt);

  // Download and decrypt manifest
  const encryptedManifest = await downloadFromStorage(config, MANIFEST_KEY);
  const manifest = await decryptManifest(encryptedManifest, masterKey);

  // Cache everything
  manifestCache = manifest;
  masterKeyCache = masterKey;
  saltCache = salt;
  
  saveToSessionCache(manifest);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
  }

  return manifest;
}

// Sync manifest from server (re-download and decrypt)
// Use this to refresh file list from server without re-entering password
export async function syncManifest(config: StorageConfig): Promise<Manifest | null> {
  // Must have cached master key and salt
  if (!masterKeyCache || !saltCache) {
    console.warn("Cannot sync manifest: not unlocked");
    return null;
  }

  try {
    // Download fresh manifest from server
    const encryptedManifest = await downloadFromStorage(config, MANIFEST_KEY);
    const manifest = await decryptManifest(encryptedManifest, masterKeyCache);

    // Update cache
    manifestCache = manifest;
    saveToSessionCache(manifest);

    return manifest;
  } catch (error) {
    console.error("Failed to sync manifest:", error);
    return null;
  }
}

// Lock manifest (clear from memory)
export function lockManifest(): void {
  manifestCache = null;
  masterKeyCache = null;
  saltCache = null;
  
  // Clear notes cache as well
  clearNotesCache();
  
  // Clear calendar cache
  clearCalendarCache();
  
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  }
}

// Get current manifest (from cache)
export function getManifest(): Manifest | null {
  if (manifestCache) return manifestCache;
  
  // Try to restore from session cache
  const cached = loadFromSessionCache();
  if (cached) {
    manifestCache = cached;
    return cached;
  }
  
  return null;
}

// Get all files from manifest
export function getFilesFromManifest(): EncryptedFileInfo[] {
  const manifest = getManifest();
  if (!manifest) return [];
  
  // Sort by uploadedAt descending
  return [...manifest.files].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

// Get file info by ID
export function getFileFromManifest(fileId: string): EncryptedFileInfo | null {
  const manifest = getManifest();
  if (!manifest) return null;
  
  return manifest.files.find(f => f.fileId === fileId) || null;
}

// Add file to manifest and sync to R2
export async function addFileToManifest(
  config: StorageConfig,
  fileInfo: EncryptedFileInfo
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  // Add file to manifest
  manifestCache.files.push(fileInfo);
  manifestCache.updatedAt = new Date().toISOString();

  // Encrypt and upload
  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);

  // Update session cache
  saveToSessionCache(manifestCache);
}

// Remove file from manifest and sync to R2
export async function removeFileFromManifest(
  config: StorageConfig,
  fileId: string
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  // Remove file from manifest
  manifestCache.files = manifestCache.files.filter(f => f.fileId !== fileId);
  manifestCache.updatedAt = new Date().toISOString();

  // Encrypt and upload
  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);

  // Update session cache
  saveToSessionCache(manifestCache);
}

// Remove multiple files from manifest and sync to R2
export async function removeFilesFromManifest(
  config: StorageConfig,
  fileIds: string[]
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const idsSet = new Set(fileIds);
  
  // Remove files from manifest
  manifestCache.files = manifestCache.files.filter(f => !idsSet.has(f.fileId));
  manifestCache.updatedAt = new Date().toISOString();

  // Encrypt and upload
  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);

  // Update session cache
  saveToSessionCache(manifestCache);
}

// Change manifest password
export async function changeManifestPassword(
  config: StorageConfig,
  newPassword: string
): Promise<void> {
  if (!manifestCache) {
    throw new Error("Manifest not unlocked");
  }

  // Generate new salt and key
  const newSalt = generateSalt();
  const newMasterKey = await deriveMasterKey(newPassword, newSalt);

  // Upload new salt
  await uploadToStorage(config, MANIFEST_SALT_KEY, newSalt);

  // Encrypt and upload manifest with new key
  const encryptedManifest = await encryptManifest(manifestCache, newMasterKey);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);

  // Update cache
  masterKeyCache = newMasterKey;
  saltCache = newSalt;
}

// Toggle file favorite status
export async function toggleFileFavorite(
  config: StorageConfig,
  fileId: string
): Promise<boolean> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const file = manifestCache.files.find(f => f.fileId === fileId);
  if (!file) {
    throw new Error("File not found");
  }

  file.isFavorite = !file.isFavorite;
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);

  return file.isFavorite;
}

// Get favorite files
export function getFavoriteFiles(): EncryptedFileInfo[] {
  const manifest = getManifest();
  if (!manifest) return [];
  
  return manifest.files
    .filter(f => f.isFavorite)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

// Create a new folder
export async function createFolder(
  config: StorageConfig,
  name: string,
  parentId?: string,
  color?: string
): Promise<Folder> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    parentId,
    createdAt: new Date().toISOString(),
    color,
  };

  if (!manifestCache.folders) {
    manifestCache.folders = [];
  }

  manifestCache.folders.push(folder);
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);

  return folder;
}

// Get all folders
export function getFolders(): Folder[] {
  const manifest = getManifest();
  if (!manifest || !manifest.folders) return [];
  return manifest.folders;
}

// Get folders in a specific parent folder
export function getFoldersInFolder(parentId?: string): Folder[] {
  const manifest = getManifest();
  if (!manifest || !manifest.folders) return [];
  
  return manifest.folders.filter(f => f.parentId === parentId);
}

// Get files in a specific folder
export function getFilesInFolder(folderId?: string): EncryptedFileInfo[] {
  const manifest = getManifest();
  if (!manifest) return [];
  
  return manifest.files
    .filter(f => f.folderId === folderId)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

// Move file to folder
export async function moveFileToFolder(
  config: StorageConfig,
  fileId: string,
  folderId?: string
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const file = manifestCache.files.find(f => f.fileId === fileId);
  if (!file) {
    throw new Error("File not found");
  }

  file.folderId = folderId;
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);
}

// Move multiple files to folder
export async function moveFilesToFolder(
  config: StorageConfig,
  fileIds: string[],
  folderId?: string
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const idsSet = new Set(fileIds);
  manifestCache.files.forEach(f => {
    if (idsSet.has(f.fileId)) {
      f.folderId = folderId;
    }
  });
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);
}

// Delete folder (and optionally its contents)
export async function deleteFolder(
  config: StorageConfig,
  folderId: string,
  deleteContents: boolean = false
): Promise<string[]> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  // Get files in folder
  const filesInFolder = manifestCache.files.filter(f => f.folderId === folderId);
  const deletedFileIds: string[] = [];

  if (deleteContents) {
    // Delete files in folder
    deletedFileIds.push(...filesInFolder.map(f => f.fileId));
    manifestCache.files = manifestCache.files.filter(f => f.folderId !== folderId);
  } else {
    // Move files to root
    manifestCache.files.forEach(f => {
      if (f.folderId === folderId) {
        f.folderId = undefined;
      }
    });
  }

  // Delete folder
  manifestCache.folders = manifestCache.folders.filter(f => f.id !== folderId);
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);

  return deletedFileIds;
}

// Rename folder
export async function renameFolder(
  config: StorageConfig,
  folderId: string,
  newName: string
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const folder = manifestCache.folders?.find(f => f.id === folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }

  folder.name = newName;
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);
}

// Rename file
export async function renameFile(
  config: StorageConfig,
  fileId: string,
  newName: string
): Promise<void> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const file = manifestCache.files.find(f => f.fileId === fileId);
  if (!file) {
    throw new Error("File not found");
  }

  file.fileName = newName;
  manifestCache.updatedAt = new Date().toISOString();

  const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
  await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
  saveToSessionCache(manifestCache);
}

// Copy files to folder (creates duplicates with new IDs)
export async function copyFilesToFolder(
  config: StorageConfig,
  fileIds: string[],
  targetFolderId?: string,
  onProgress?: (copied: number, total: number) => void
): Promise<string[]> {
  if (!manifestCache || !masterKeyCache) {
    throw new Error("Manifest not unlocked");
  }

  const newFileIds: string[] = [];
  const total = fileIds.length;
  let copied = 0;

  for (const fileId of fileIds) {
    const originalFile = manifestCache.files.find(f => f.fileId === fileId);
    if (!originalFile) continue;

    // Download the encrypted file
    const encryptedData = await downloadFromStorage(config, `files/${fileId}`);

    // Generate new file ID
    const newFileId = crypto.randomUUID();

    // Upload to new location
    await uploadToStorage(config, `files/${newFileId}`, encryptedData);

    // Create new file entry (copy of original but with new ID and target folder)
    const newFile: EncryptedFileInfo = {
      ...originalFile,
      fileId: newFileId,
      folderId: targetFolderId,
      uploadedAt: new Date().toISOString(),
      // Add "(copy)" to filename if copying to the same folder
      fileName: targetFolderId === originalFile.folderId 
        ? addCopySuffix(originalFile.fileName)
        : originalFile.fileName,
    };

    manifestCache.files.push(newFile);
    newFileIds.push(newFileId);
    copied++;
    onProgress?.(copied, total);
  }

  if (newFileIds.length > 0) {
    manifestCache.updatedAt = new Date().toISOString();
    const encryptedManifest = await encryptManifest(manifestCache, masterKeyCache);
    await uploadToStorage(config, MANIFEST_KEY, encryptedManifest);
    saveToSessionCache(manifestCache);
  }

  return newFileIds;
}

// Helper to add "(copy)" suffix to filename
function addCopySuffix(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return `${fileName} (copy)`;
  }
  const name = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${name} (copy)${ext}`;
}

// Get the cached master key (for use with notes system)
// Returns null if manifest is not unlocked
export function getMasterKey(): CryptoKey | null {
  return masterKeyCache;
}
