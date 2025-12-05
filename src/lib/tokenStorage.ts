// Token Storage Service

const COOKIE_PREFIX = "auth_";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

function setCookie(name: string, value: string, expiresInDays: number = 7): void {
  if (typeof document === 'undefined') return;
  
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + expiresInDays);
  
  const cookieOptions = [
    `Path=/`,
    `Expires=${expirationDate.toUTCString()}`,
    `SameSite=Strict`,
    ...(typeof window !== 'undefined' && window.location.protocol === 'https:' ? ['Secure'] : []),
  ].join("; ");

  document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieOptions}`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.split("=");
    if (cookieName === name && cookieValue) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  
  const pastDate = new Date(0).toUTCString();
  document.cookie = `${name}=; Path=/; Expires=${pastDate}`;
}

function getExpirationDays(expiresAt: string): number {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export class TokenStorage {
  static saveTokens(tokens: StoredTokens): void {
    try {
      const accessExpDays = getExpirationDays(tokens.accessExpiresAt);
      const refreshExpDays = getExpirationDays(tokens.refreshExpiresAt);
      
      const accessCookieName = `${COOKIE_PREFIX}access_expires_at`;
      const refreshCookieName = `${COOKIE_PREFIX}refresh_expires_at`;
      
      setCookie(accessCookieName, tokens.accessExpiresAt, accessExpDays);
      setCookie(refreshCookieName, tokens.refreshExpiresAt, refreshExpDays);
    } catch (error) {
      // Silent
    }
  }

  static getAccessToken(): string | null {
    return null;
  }

  static getRefreshToken(): string | null {
    return null;
  }

  static getAccessExpiresAt(): Date | null {
    try {
      const accessCookieName = `${COOKIE_PREFIX}access_expires_at`;
      const value = getCookie(accessCookieName);
      if (value) {
        return new Date(value);
      }
    } catch (error) {
      // Silent
    }
    return null;
  }

  static getRefreshExpiresAt(): Date | null {
    try {
      const refreshCookieName = `${COOKIE_PREFIX}refresh_expires_at`;
      const value = getCookie(refreshCookieName);
      if (value) {
        return new Date(value);
      }
    } catch (error) {
      // Silent
    }
    return null;
  }

  static clearTokens(): void {
    try {
      deleteCookie(`${COOKIE_PREFIX}access_expires_at`);
      deleteCookie(`${COOKIE_PREFIX}refresh_expires_at`);
    } catch (error) {
      // Silent
    }
  }

  static isAccessTokenExpired(): boolean {
    const expiresAt = this.getAccessExpiresAt();
    if (!expiresAt) return true;
    const bufferMs = 2 * 60 * 1000;
    return new Date().getTime() + bufferMs >= expiresAt.getTime();
  }

  static isRefreshTokenExpired(): boolean {
    const expiresAt = this.getRefreshExpiresAt();
    if (!expiresAt) return true;
    const bufferMs = 2 * 60 * 1000;
    return new Date().getTime() + bufferMs >= expiresAt.getTime();
  }
}
