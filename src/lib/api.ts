// API Functions for authentication

import { getApiBaseUrl, getServerPassword } from "./settings";
import { extractCsrfTokenFromResponse, refreshCsrfTokenOnError, getCsrfHeaders } from "./csrf";

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getRequestIdHeaders(): Record<string, string> {
  return { 'X-Request-ID': generateRequestId() };
}

async function parseErrorResponse(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const data = await response.json();
    return {
      message: data.error?.message || data.message || `Request failed with status ${response.status}`,
      code: data.error?.code,
    };
  } catch {
    return { message: `Request failed with status ${response.status}` };
  }
}

// Wrapper for fetch that extracts CSRF token from response headers
async function fetchWithCsrfExtraction(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  
  extractCsrfTokenFromResponse(response);
  
  if (response.status === 403) {
    try {
      const errorData = await response.clone().json().catch(() => ({}));
      if (errorData.error?.code === 'CSRF_INVALID' || errorData.message?.includes('CSRF')) {
        const newToken = await refreshCsrfTokenOnError();
        if (newToken) {
          const newOptions = {
            ...options,
            headers: {
              ...options.headers,
              'X-CSRF-Token': newToken,
            },
          };
          const retryResponse = await fetch(url, newOptions);
          extractCsrfTokenFromResponse(retryResponse);
          return retryResponse;
        }
      }
    } catch (error) {
      console.error("CSRF refresh/retry failed:", error);
    }
  }
  
  return response;
}

function getBasicHeaders(): HeadersInit {
  const serverPassword = getServerPassword();

  return {
    "Content-Type": "application/json",
    ...getRequestIdHeaders(),
    ...(serverPassword && { "X-Server-Password": serverPassword }),
  };
}

async function getAuthHeadersAsync(method: string, url?: string): Promise<HeadersInit> {
  const serverPassword = getServerPassword();
  const csrfHeaders = await getCsrfHeaders(method, url);

  return {
    "Content-Type": "application/json",
    ...getRequestIdHeaders(),
    ...(serverPassword && { "X-Server-Password": serverPassword }),
    ...csrfHeaders,
  };
}

// Check if a username is available
export async function checkUsernameAvailable(
  username: string
): Promise<{ success: boolean; data: { username: string; available: boolean } }> {
  const headers = await getAuthHeadersAsync("POST", `${getApiBaseUrl()}/auth/check-username`);
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/auth/check-username`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username }),
    credentials: 'include',
  });

  if (!response.ok) {
    const { message } = await parseErrorResponse(response);
    throw new Error(message);
  }

  return response.json();
}

// Register a new user
export async function registerUser(
  username: string,
  publicKey: string,
  invitationCode?: string
): Promise<{
  success: boolean;
  user: {
    id: string;
    username: string;
    publicKey: string;
  };
  auth: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
    tokenType: string;
  };
}> {
  const body: {
    username: string;
    publicKey: string;
    invitationCode?: string;
  } = {
    username,
    publicKey,
  };

  if (invitationCode) {
    body.invitationCode = invitationCode;
  }

  const headers = await getAuthHeadersAsync("POST", `${getApiBaseUrl()}/auth/register`);
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });

  if (!response.ok) {
    const { message } = await parseErrorResponse(response);
    throw new Error(message);
  }

  return response.json();
}

// Get login challenge
export async function getLoginChallenge(
  username: string
): Promise<{
  success: boolean;
  data: {
    username: string;
    publicKey: string;
    challenge: string;
    expiresAt: string;
    requires2FA?: boolean;
  };
}> {
  const headers = await getAuthHeadersAsync("POST", `${getApiBaseUrl()}/auth/login/challenge`);
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/auth/login/challenge`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username }),
    credentials: 'include',
  });

  if (!response.ok) {
    const { message } = await parseErrorResponse(response);
    throw new Error(message);
  }

  return response.json();
}

// Verify login signature
export async function verifyLoginSignature(
  username: string,
  signature: string,
  twoFactorToken?: string
): Promise<{
  success: boolean;
  requires2FA?: boolean;
  message?: string;
  user?: {
    id: string;
    username: string;
    publicKey: string;
  };
  auth?: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  };
}> {
  const body: any = { username, signature };
  if (twoFactorToken) {
    body.twoFactorToken = twoFactorToken;
  }

  const headers = await getAuthHeadersAsync("POST", `${getApiBaseUrl()}/auth/login/verify`);
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/auth/login/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });

  // Try to parse response JSON first
  const data = await response.json().catch(() => null);

  // If response is not ok, check if it's a 2FA required response
  if (!response.ok) {
    // Check if this is a 2FA required response (usually 401 or 403)
    if (data && data.requires2FA) {
      return {
        success: false,
        requires2FA: true,
        message: data.message || "Two-factor authentication required",
      };
    }
    // Otherwise throw error as usual
    const message = data?.message || data?.error?.message || "Request failed";
    throw new Error(message);
  }

  return data;
}

// Check if invite-only mode is enabled
export async function checkInviteOnlyMode(): Promise<{
  success: boolean;
  data: {
    inviteOnlyMode: boolean;
  };
}> {
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/settings/invite-only`, {
    method: "GET",
    headers: getBasicHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return { success: true, data: { inviteOnlyMode: false } };
  }

  return response.json();
}

// Validate invitation code
export async function validateInvitationCode(code: string): Promise<{
  success: boolean;
  data: {
    isValid: boolean;
    reason?: string;
    expiresAt?: string;
  };
}> {
  const headers = await getAuthHeadersAsync("POST", `${getApiBaseUrl()}/invitations/validate`);
  const response = await fetchWithCsrfExtraction(`${getApiBaseUrl()}/invitations/validate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
    credentials: 'include',
  });

  if (!response.ok) {
    return { success: true, data: { isValid: false, reason: "Invalid code" } };
  }

  return response.json();
}

// Handle auth error
export function handleAuthError(status: number): void {
  if (status === 401 || status === 403) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth-error'));
    }
  }
}
