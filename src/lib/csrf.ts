// CSRF Token Management

import { getApiBaseUrl } from "./settings";

const CSRF_TOKEN_KEY = 'csrfToken';
const CSRF_TOKEN_EXPIRY_KEY = 'csrfTokenExpiry';
const TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 1 hour

let refreshPromise: Promise<string | null> | null = null;

// Get CSRF token from localStorage
function getStoredCsrfToken(): string | null {
  try {
    const token = localStorage.getItem(CSRF_TOKEN_KEY);
    const expiry = localStorage.getItem(CSRF_TOKEN_EXPIRY_KEY);
    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        return token;
      } else {
        localStorage.removeItem(CSRF_TOKEN_KEY);
        localStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Store CSRF token in localStorage
function storeCsrfToken(token: string): void {
  try {
    const expiry = Date.now() + TOKEN_VALIDITY_MS;
    localStorage.setItem(CSRF_TOKEN_KEY, token);
    localStorage.setItem(CSRF_TOKEN_EXPIRY_KEY, expiry.toString());
  } catch (error) {
    console.error("Error storing CSRF token:", error);
  }
}

// Get CSRF token from API
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/csrf-token`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.token) {
      const token = data.token;
      storeCsrfToken(token);
      return token;
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Get valid CSRF token
export async function getCsrfToken(): Promise<string | null> {
  const storedToken = getStoredCsrfToken();
  if (storedToken) {
    return storedToken;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetchCsrfToken().then((token) => {
    refreshPromise = null;
    return token;
  });

  return refreshPromise;
}

// Get CSRF token synchronously
export function getCsrfTokenSync(): string | null {
  return getStoredCsrfToken();
}

// Extract CSRF token from response headers
export function extractCsrfTokenFromResponse(response: Response): void {
  const token = response.headers.get("X-CSRF-Token");
  if (token) {
    storeCsrfToken(token);
  }
}

// Clear CSRF token
export function clearCsrfToken(): void {
  try {
    localStorage.removeItem(CSRF_TOKEN_KEY);
    localStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
  } catch (error) {
    console.error("Error clearing CSRF token:", error);
  }
  refreshPromise = null;
}

// Refresh CSRF token on error
export async function refreshCsrfTokenOnError(): Promise<string | null> {
  clearCsrfToken();
  return fetchCsrfToken();
}

// Get CSRF headers for a request
export async function getCsrfHeaders(_method: string, _url?: string): Promise<HeadersInit> {
  const token = await getCsrfToken();
  if (token) {
    return { 'X-CSRF-Token': token };
  }
  return {};
}

// Get CSRF headers synchronously
export function getCsrfHeadersSync(_method: string): HeadersInit {
  const token = getCsrfTokenSync();
  if (token) {
    return { 'X-CSRF-Token': token };
  }
  return {};
}

// Initialize CSRF token
export async function initializeCsrfToken(): Promise<void> {
  await getCsrfToken();
}
