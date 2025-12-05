// E2EE Notes System
// Stores encrypted notes in a separate folder on S3/R2
// Notes are encrypted client-side before upload
// Uses the same master key as the file manifest

import { StorageConfig } from "./settings";
import { uploadToStorage, downloadFromStorage, deleteFromStorage } from "./storage-client";
import { bytesToBase64, base64ToBytes } from "./e2ee";

const NOTES_MANIFEST_KEY = ".notes-manifest.enc";
const NOTES_FOLDER = "notes/";

export interface Note {
  id: string;
  title: string;
  content: string; // Markdown content
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  tags: string[];
  color?: string; // Optional note color
}

export interface NotesManifest {
  version: number;
  notes: NoteMetadata[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  tags: string[];
  color?: string;
  contentKey: string; // Storage key for encrypted content
  preview?: string; // First 100-150 chars of content for preview
}

// In-memory cache
let notesManifestCache: NotesManifest | null = null;
let notesMasterKeyCache: CryptoKey | null = null;

// Generate unique note ID
export function generateNoteId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `note_${timestamp}_${random}`;
}

// Encrypt data with master key
async function encryptData(data: string, masterKey: CryptoKey): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    encoder.encode(data)
  );

  // Prepend IV to encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

// Decrypt data with master key
async function decryptData(encryptedData: Uint8Array, masterKey: CryptoKey): Promise<string> {
  const iv = encryptedData.slice(0, 12);
  const data = encryptedData.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    masterKey,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Create empty notes manifest
function createEmptyNotesManifest(): NotesManifest {
  return {
    version: 1,
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Check if notes system is initialized
export function isNotesInitialized(): boolean {
  return notesManifestCache !== null && notesMasterKeyCache !== null;
}

// Initialize notes system with master key (should be called after manifest unlock)
export async function initializeNotes(
  config: StorageConfig,
  masterKey: CryptoKey
): Promise<NotesManifest> {
  notesMasterKeyCache = masterKey;

  try {
    // Try to download existing notes manifest
    const encryptedManifest = await downloadFromStorage(config, NOTES_MANIFEST_KEY);
    const manifestJson = await decryptData(encryptedManifest, masterKey);
    notesManifestCache = JSON.parse(manifestJson);
    return notesManifestCache!;
  } catch {
    // Create new notes manifest
    notesManifestCache = createEmptyNotesManifest();
    await saveNotesManifest(config);
    return notesManifestCache;
  }
}

// Save notes manifest to storage
async function saveNotesManifest(config: StorageConfig): Promise<void> {
  if (!notesManifestCache || !notesMasterKeyCache) {
    throw new Error("Notes system not initialized");
  }

  notesManifestCache.updatedAt = new Date().toISOString();
  const manifestJson = JSON.stringify(notesManifestCache);
  const encrypted = await encryptData(manifestJson, notesMasterKeyCache);
  await uploadToStorage(config, NOTES_MANIFEST_KEY, encrypted);
}

// Get all notes metadata
export function getNotesMetadata(): NoteMetadata[] {
  return notesManifestCache?.notes || [];
}

// Create a new note
export async function createNote(
  config: StorageConfig,
  title: string,
  content: string,
  tags: string[] = [],
  color?: string
): Promise<NoteMetadata> {
  if (!notesManifestCache || !notesMasterKeyCache) {
    throw new Error("Notes system not initialized");
  }

  const noteId = generateNoteId();
  const contentKey = `${NOTES_FOLDER}${noteId}.enc`;
  const now = new Date().toISOString();

  // Encrypt and upload content
  const encryptedContent = await encryptData(content, notesMasterKeyCache);
  await uploadToStorage(config, contentKey, encryptedContent);

  // Add to manifest
  const noteMetadata: NoteMetadata = {
    id: noteId,
    title,
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    tags,
    color,
    contentKey,
  };

  notesManifestCache.notes.push(noteMetadata);
  await saveNotesManifest(config);

  return noteMetadata;
}

// Get full note with content
export async function getNote(
  config: StorageConfig,
  noteId: string
): Promise<Note | null> {
  if (!notesManifestCache || !notesMasterKeyCache) {
    throw new Error("Notes system not initialized");
  }

  const metadata = notesManifestCache.notes.find(n => n.id === noteId);
  if (!metadata) return null;

  try {
    const encryptedContent = await downloadFromStorage(config, metadata.contentKey);
    const content = await decryptData(encryptedContent, notesMasterKeyCache);

    return {
      id: metadata.id,
      title: metadata.title,
      content,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      isPinned: metadata.isPinned,
      tags: metadata.tags,
      color: metadata.color,
    };
  } catch (error) {
    console.error("Failed to load note content:", error);
    return null;
  }
}

// Update a note
export async function updateNote(
  config: StorageConfig,
  noteId: string,
  updates: Partial<Pick<Note, "title" | "content" | "isPinned" | "tags" | "color">>
): Promise<NoteMetadata | null> {
  if (!notesManifestCache || !notesMasterKeyCache) {
    throw new Error("Notes system not initialized");
  }

  const index = notesManifestCache.notes.findIndex(n => n.id === noteId);
  if (index === -1) return null;

  const metadata = notesManifestCache.notes[index];
  const now = new Date().toISOString();

  // Update content if provided
  if (updates.content !== undefined) {
    const encryptedContent = await encryptData(updates.content, notesMasterKeyCache);
    await uploadToStorage(config, metadata.contentKey, encryptedContent);
  }

  // Update metadata
  if (updates.title !== undefined) metadata.title = updates.title;
  if (updates.isPinned !== undefined) metadata.isPinned = updates.isPinned;
  if (updates.tags !== undefined) metadata.tags = updates.tags;
  if (updates.color !== undefined) metadata.color = updates.color;
  metadata.updatedAt = now;

  notesManifestCache.notes[index] = metadata;
  await saveNotesManifest(config);

  return metadata;
}

// Delete a note
export async function deleteNote(
  config: StorageConfig,
  noteId: string
): Promise<boolean> {
  if (!notesManifestCache || !notesMasterKeyCache) {
    throw new Error("Notes system not initialized");
  }

  const index = notesManifestCache.notes.findIndex(n => n.id === noteId);
  if (index === -1) return false;

  const metadata = notesManifestCache.notes[index];

  // Delete content from storage
  try {
    await deleteFromStorage(config, metadata.contentKey);
  } catch {
    // Continue even if delete fails
  }

  // Remove from manifest
  notesManifestCache.notes.splice(index, 1);
  await saveNotesManifest(config);

  return true;
}

// Toggle note pin status
export async function toggleNotePin(
  config: StorageConfig,
  noteId: string
): Promise<NoteMetadata | null> {
  const metadata = notesManifestCache?.notes.find(n => n.id === noteId);
  if (!metadata) return null;

  return updateNote(config, noteId, { isPinned: !metadata.isPinned });
}

// Search notes by title or tags
export function searchNotes(query: string): NoteMetadata[] {
  if (!notesManifestCache) return [];

  const lowerQuery = query.toLowerCase();
  return notesManifestCache.notes.filter(note =>
    note.title.toLowerCase().includes(lowerQuery) ||
    note.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

// Get notes by tag
export function getNotesByTag(tag: string): NoteMetadata[] {
  if (!notesManifestCache) return [];

  return notesManifestCache.notes.filter(note =>
    note.tags.includes(tag)
  );
}

// Get all unique tags
export function getAllTags(): string[] {
  if (!notesManifestCache) return [];

  const tags = new Set<string>();
  notesManifestCache.notes.forEach(note => {
    note.tags.forEach(tag => tags.add(tag));
  });

  return Array.from(tags).sort();
}

// Clear notes cache (call on logout or lock)
export function clearNotesCache(): void {
  notesManifestCache = null;
  notesMasterKeyCache = null;
}

// Set master key for notes (used when manifest is unlocked)
export function setNotesMasterKey(masterKey: CryptoKey): void {
  notesMasterKeyCache = masterKey;
}

// Get cached notes manifest
export function getCachedNotesManifest(): NotesManifest | null {
  return notesManifestCache;
}

// Generate a random share password
export function generateNoteSharePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  const randomValues = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) {
    password += chars[randomValues[i] % chars.length];
  }
  return password;
}

// Derive key from password for note sharing
async function deriveNoteShareKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Create a shared note link - encodes encrypted note data directly in URL
export async function createNoteShare(
  config: StorageConfig,
  noteId: string,
  password?: string
): Promise<{ shareId: string; password: string; url: string }> {
  // Get the full note
  const note = await getNote(config, noteId);
  if (!note) {
    throw new Error("Note not found");
  }
  
  const sharePassword = password || generateNoteSharePassword();
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveNoteShareKey(sharePassword, salt);
  
  // Prepare note data
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const noteBundle = {
    v: 1,
    title: note.title,
    content: note.content,
    tags: note.tags,
  };
  
  // Encrypt note data
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(noteBundle))
  );
  
  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Create URL-safe bundle: salt.encryptedData
  const bundle = `${bytesToBase64(salt)}.${bytesToBase64(combined)}`;
  
  // Generate share URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${baseUrl}/share?note=${encodeURIComponent(bundle)}`;
  
  return {
    shareId: bundle.substring(0, 20),
    password: sharePassword,
    url,
  };
}

// Decrypt shared note from URL bundle
export async function decryptSharedNote(
  bundle: string,
  password: string
): Promise<{ title: string; content: string; tags: string[] } | null> {
  try {
    const parts = bundle.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid bundle format');
    }
    
    const salt = base64ToBytes(parts[0]);
    const encryptedData = base64ToBytes(parts[1]);
    
    const key = await deriveNoteShareKey(password, salt);
    
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    const decoder = new TextDecoder();
    const noteData = JSON.parse(decoder.decode(decrypted));
    
    if (noteData.v !== 1) {
      throw new Error('Unsupported version');
    }
    
    return {
      title: noteData.title,
      content: noteData.content,
      tags: noteData.tags || [],
    };
  } catch (error) {
    console.error("Failed to decrypt shared note:", error);
    return null;
  }
}

// Sync notes manifest from storage (for refresh functionality)
export async function syncNotes(config: StorageConfig): Promise<NotesManifest | null> {
  if (!notesMasterKeyCache) {
    return null;
  }

  try {
    const encryptedManifest = await downloadFromStorage(config, NOTES_MANIFEST_KEY);
    const manifestJson = await decryptData(encryptedManifest, notesMasterKeyCache);
    notesManifestCache = JSON.parse(manifestJson);
    return notesManifestCache;
  } catch (error) {
    console.error("Failed to sync notes:", error);
    return notesManifestCache;
  }
}
