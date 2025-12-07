// E2EE Calendar System
// Stores encrypted calendar events in S3/R2
// Events are encrypted client-side before upload
// Uses the same master key as the file manifest

import { StorageConfig } from "./settings";
import { uploadToStorage, downloadFromStorage, deleteFromStorage } from "./storage-client";

const CALENDAR_MANIFEST_KEY = ".calendar-manifest.enc";
const CALENDAR_EVENTS_FOLDER = "calendar/";

export type EventRepeatType = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location?: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  allDay: boolean;
  color?: string;
  repeat: EventRepeatType;
  repeatEndDate?: string; // When to stop repeating
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface CalendarEventMetadata {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color?: string;
  repeat: EventRepeatType;
  repeatEndDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  contentKey: string; // Storage key for encrypted full event
}

export interface CalendarManifest {
  version: number;
  events: CalendarEventMetadata[];
  createdAt: string;
  updatedAt: string;
}

// In-memory cache
let calendarManifestCache: CalendarManifest | null = null;
let calendarMasterKeyCache: CryptoKey | null = null;

// Generate unique event ID
export function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `event_${timestamp}_${random}`;
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

// Create empty calendar manifest
function createEmptyCalendarManifest(): CalendarManifest {
  return {
    version: 1,
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Check if calendar system is initialized
export function isCalendarInitialized(): boolean {
  return calendarManifestCache !== null && calendarMasterKeyCache !== null;
}

// Initialize calendar system with master key (should be called after manifest unlock)
export async function initializeCalendar(
  config: StorageConfig,
  masterKey: CryptoKey
): Promise<CalendarManifest> {
  calendarMasterKeyCache = masterKey;

  try {
    // Try to download existing calendar manifest
    const encryptedManifest = await downloadFromStorage(config, CALENDAR_MANIFEST_KEY);
    const manifestJson = await decryptData(encryptedManifest, masterKey);
    calendarManifestCache = JSON.parse(manifestJson);
    return calendarManifestCache!;
  } catch {
    // Create new calendar manifest
    calendarManifestCache = createEmptyCalendarManifest();
    await saveCalendarManifest(config);
    return calendarManifestCache;
  }
}

// Save calendar manifest to storage
async function saveCalendarManifest(config: StorageConfig): Promise<void> {
  if (!calendarManifestCache || !calendarMasterKeyCache) {
    throw new Error("Calendar system not initialized");
  }

  calendarManifestCache.updatedAt = new Date().toISOString();
  const manifestJson = JSON.stringify(calendarManifestCache);
  const encrypted = await encryptData(manifestJson, calendarMasterKeyCache);
  await uploadToStorage(config, CALENDAR_MANIFEST_KEY, encrypted);
}

// Get all events metadata
export function getEventsMetadata(): CalendarEventMetadata[] {
  return calendarManifestCache?.events || [];
}

// Get events for a specific date range
export function getEventsInRange(startDate: Date, endDate: Date): CalendarEventMetadata[] {
  if (!calendarManifestCache) return [];

  const start = startDate.getTime();
  const end = endDate.getTime();

  return calendarManifestCache.events.filter(event => {
    const eventStart = new Date(event.startDate).getTime();
    const eventEnd = new Date(event.endDate).getTime();
    
    // Check if event overlaps with the date range
    return eventStart <= end && eventEnd >= start;
  });
}

// Get events for a specific day
export function getEventsForDay(date: Date): CalendarEventMetadata[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return getEventsInRange(dayStart, dayEnd);
}

// Get events for a specific month
export function getEventsForMonth(year: number, month: number): CalendarEventMetadata[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  return getEventsInRange(monthStart, monthEnd);
}

// Get events with upcoming reminders (within next 24 hours)
export function getUpcomingReminders(): CalendarEventMetadata[] {
  if (!calendarManifestCache) return [];

  const now = Date.now();
  const dayFromNow = now + 24 * 60 * 60 * 1000;

  return calendarManifestCache.events.filter(event => {
    const eventStart = new Date(event.startDate).getTime();
    return eventStart >= now && eventStart <= dayFromNow;
  });
}

// Create a new event
export async function createEvent(
  config: StorageConfig,
  eventData: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
): Promise<CalendarEventMetadata> {
  if (!calendarManifestCache || !calendarMasterKeyCache) {
    throw new Error("Calendar system not initialized");
  }

  const eventId = generateEventId();
  const contentKey = `${CALENDAR_EVENTS_FOLDER}${eventId}.enc`;
  const now = new Date().toISOString();

  const event: CalendarEvent = {
    ...eventData,
    id: eventId,
    createdAt: now,
    updatedAt: now,
  };

  // Encrypt and upload event content
  const encryptedContent = await encryptData(JSON.stringify(event), calendarMasterKeyCache);
  await uploadToStorage(config, contentKey, encryptedContent);

  // Add to manifest
  const eventMetadata: CalendarEventMetadata = {
    id: eventId,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    color: event.color,
    repeat: event.repeat,
    repeatEndDate: event.repeatEndDate,
    tags: event.tags,
    createdAt: now,
    updatedAt: now,
    contentKey,
  };

  calendarManifestCache.events.push(eventMetadata);
  await saveCalendarManifest(config);

  return eventMetadata;
}

// Get full event with content
export async function getEvent(
  config: StorageConfig,
  eventId: string
): Promise<CalendarEvent | null> {
  if (!calendarManifestCache || !calendarMasterKeyCache) {
    throw new Error("Calendar system not initialized");
  }

  const metadata = calendarManifestCache.events.find(e => e.id === eventId);
  if (!metadata) return null;

  try {
    const encryptedContent = await downloadFromStorage(config, metadata.contentKey);
    const content = await decryptData(encryptedContent, calendarMasterKeyCache);
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to load event content:", error);
    return null;
  }
}

// Update an event
export async function updateEvent(
  config: StorageConfig,
  eventId: string,
  updates: Partial<Omit<CalendarEvent, "id" | "createdAt">>
): Promise<CalendarEventMetadata | null> {
  if (!calendarManifestCache || !calendarMasterKeyCache) {
    throw new Error("Calendar system not initialized");
  }

  const index = calendarManifestCache.events.findIndex(e => e.id === eventId);
  if (index === -1) return null;

  const metadata = calendarManifestCache.events[index];
  const now = new Date().toISOString();

  // Get full event, merge updates
  const existingEvent = await getEvent(config, eventId);
  if (!existingEvent) return null;

  const updatedEvent: CalendarEvent = {
    ...existingEvent,
    ...updates,
    updatedAt: now,
  };

  // Encrypt and upload updated content
  const encryptedContent = await encryptData(JSON.stringify(updatedEvent), calendarMasterKeyCache);
  await uploadToStorage(config, metadata.contentKey, encryptedContent);

  // Update metadata
  metadata.title = updatedEvent.title;
  metadata.startDate = updatedEvent.startDate;
  metadata.endDate = updatedEvent.endDate;
  metadata.allDay = updatedEvent.allDay;
  metadata.color = updatedEvent.color;
  metadata.repeat = updatedEvent.repeat;
  metadata.repeatEndDate = updatedEvent.repeatEndDate;
  metadata.tags = updatedEvent.tags;
  metadata.updatedAt = now;

  calendarManifestCache.events[index] = metadata;
  await saveCalendarManifest(config);

  return metadata;
}

// Delete an event
export async function deleteEvent(
  config: StorageConfig,
  eventId: string
): Promise<boolean> {
  if (!calendarManifestCache || !calendarMasterKeyCache) {
    throw new Error("Calendar system not initialized");
  }

  const index = calendarManifestCache.events.findIndex(e => e.id === eventId);
  if (index === -1) return false;

  const metadata = calendarManifestCache.events[index];

  // Delete content from storage
  try {
    await deleteFromStorage(config, metadata.contentKey);
  } catch {
    // Continue even if delete fails
  }

  // Remove from manifest
  calendarManifestCache.events.splice(index, 1);
  await saveCalendarManifest(config);

  return true;
}

// Search events by title or tags
export function searchEvents(query: string): CalendarEventMetadata[] {
  if (!calendarManifestCache) return [];

  const lowerQuery = query.toLowerCase();
  return calendarManifestCache.events.filter(event =>
    event.title.toLowerCase().includes(lowerQuery) ||
    event.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

// Get all unique tags from events
export function getAllEventTags(): string[] {
  if (!calendarManifestCache) return [];

  const tagsSet = new Set<string>();
  calendarManifestCache.events.forEach(event => {
    event.tags.forEach(tag => tagsSet.add(tag));
  });

  return Array.from(tagsSet).sort();
}

// Get events by tag
export function getEventsByTag(tag: string): CalendarEventMetadata[] {
  if (!calendarManifestCache) return [];

  return calendarManifestCache.events.filter(event =>
    event.tags.some(t => t.toLowerCase() === tag.toLowerCase())
  );
}

// Sync calendar from storage (re-download and decrypt)
export async function syncCalendar(config: StorageConfig): Promise<CalendarManifest | null> {
  if (!calendarMasterKeyCache) {
    console.warn("Cannot sync calendar: not initialized");
    return null;
  }

  try {
    const encryptedManifest = await downloadFromStorage(config, CALENDAR_MANIFEST_KEY);
    const manifestJson = await decryptData(encryptedManifest, calendarMasterKeyCache);
    calendarManifestCache = JSON.parse(manifestJson);
    return calendarManifestCache;
  } catch (error) {
    console.error("Failed to sync calendar:", error);
    return null;
  }
}

// Clear calendar cache
export function clearCalendarCache(): void {
  calendarManifestCache = null;
  calendarMasterKeyCache = null;
}

// Get calendar statistics
export function getCalendarStats(): {
  totalEvents: number;
  upcomingEvents: number;
  eventsThisMonth: number;
} {
  if (!calendarManifestCache) {
    return { totalEvents: 0, upcomingEvents: 0, eventsThisMonth: 0 };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const upcomingEvents = calendarManifestCache.events.filter(e => 
    new Date(e.startDate) >= todayStart
  ).length;

  const eventsThisMonth = getEventsInRange(monthStart, monthEnd).length;

  return {
    totalEvents: calendarManifestCache.events.length,
    upcomingEvents,
    eventsThisMonth,
  };
}

// Generate repeating event occurrences for a date range (virtual, not stored)
export function generateRepeatingOccurrences(
  event: CalendarEventMetadata,
  rangeStart: Date,
  rangeEnd: Date
): Array<{ date: Date; isOriginal: boolean }> {
  if (event.repeat === "none") {
    return [{ date: new Date(event.startDate), isOriginal: true }];
  }

  const occurrences: Array<{ date: Date; isOriginal: boolean }> = [];
  const eventStart = new Date(event.startDate);
  const repeatEnd = event.repeatEndDate ? new Date(event.repeatEndDate) : rangeEnd;
  const finalEnd = repeatEnd < rangeEnd ? repeatEnd : rangeEnd;

  let currentDate = new Date(eventStart);
  let isFirst = true;

  while (currentDate <= finalEnd) {
    if (currentDate >= rangeStart && currentDate <= finalEnd) {
      occurrences.push({
        date: new Date(currentDate),
        isOriginal: isFirst,
      });
    }
    isFirst = false;

    switch (event.repeat) {
      case "daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "weekly":
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case "monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "yearly":
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
      default:
        return occurrences;
    }
  }

  return occurrences;
}

// Event color presets
export const EVENT_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#eab308" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Gray", value: "#6b7280" },
];
