// User Settings Management
// Allows users to configure their API server URL and S3/R2 storage

const SETTINGS_KEY = "app_settings";
const STORAGE_CONFIG_KEY = "storage_config";

export interface AppSettings {
  apiServerUrl: string;
  serverPassword?: string;
  primaryServerName?: string;
}

export interface StorageConfig {
  provider: 's3' | 'r2' | 'custom';
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountId?: string; // For Cloudflare R2
}

const DEFAULT_SETTINGS: AppSettings = {
  apiServerUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.unet.live/api",
  primaryServerName: "UNET Main",
};

// Get current settings from localStorage
export function getSettings(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
export function saveSettings(settings: Partial<AppSettings>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = getSettings();
    const updated = {
      ...current,
      ...settings,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

// Get API base URL from settings
export function getApiBaseUrl(): string {
  return getSettings().apiServerUrl;
}

// Reset settings to default
export function resetSettings(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(SETTINGS_KEY);
}

// Get server password from settings
export function getServerPassword(): string | undefined {
  return getSettings().serverPassword;
}

// Get storage configuration from localStorage
export function getStorageConfig(): StorageConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load storage config:", error);
  }

  return null;
}

// Save storage configuration to localStorage
export function saveStorageConfig(config: StorageConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Failed to save storage config:", error);
  }
}

// Clear storage configuration
export function clearStorageConfig(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(STORAGE_CONFIG_KEY);
}

// Check if storage is configured
export function isStorageConfigured(): boolean {
  const config = getStorageConfig();
  return !!(
    config &&
    config.endpoint &&
    config.bucket &&
    config.accessKeyId &&
    config.secretAccessKey
  );
}

// Predefined servers for easy selection
export interface PredefinedServer {
  id: string;
  name: string;
  apiUrl: string;
  description?: string;
}

export const PREDEFINED_SERVERS: PredefinedServer[] = [
  {
    id: "unet-main",
    name: "UNET Main",
    apiUrl: "https://api.unet.live/api",
    description: "Official UNET server",
  },
  {
    id: "custom",
    name: "Custom Server",
    apiUrl: "",
    description: "Enter your own server URL",
  },
];

// Get current server ID based on API URL
export function getCurrentServerId(): string {
  const currentUrl = getApiBaseUrl();
  const server = PREDEFINED_SERVERS.find(s => s.apiUrl === currentUrl);
  return server?.id || "custom";
}

// Set server by ID
export function setServerById(serverId: string, customUrl?: string): void {
  const server = PREDEFINED_SERVERS.find(s => s.id === serverId);
  if (server && server.id !== "custom") {
    saveSettings({ apiServerUrl: server.apiUrl, primaryServerName: server.name });
  } else if (customUrl) {
    saveSettings({ apiServerUrl: customUrl, primaryServerName: "Custom Server" });
  }
}
