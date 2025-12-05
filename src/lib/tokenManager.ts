// Token Manager - handles automatic token refresh

import { TokenStorage } from "./tokenStorage";
import { getApiBaseUrl, getServerPassword } from "./settings";
import { getCsrfToken } from "./csrf";

class TokenManager {
  private static instance: TokenManager;
  private refreshPromise: Promise<boolean> | null = null;
  private onLogoutCallback: (() => void) | null = null;
  private onTokenRefreshedCallback: (() => void) | null = null;
  private refreshIntervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  initialize(
    onLogout: () => void,
    onTokenRefreshed: () => void
  ): void {
    this.onLogoutCallback = onLogout;
    this.onTokenRefreshedCallback = onTokenRefreshed;
    this.startAutoRefresh();
  }

  private startAutoRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }

    this.refreshIntervalId = setInterval(async () => {
      if (TokenStorage.isAccessTokenExpired() && !TokenStorage.isRefreshTokenExpired()) {
        await this.getValidAccessToken();
      }
    }, 60 * 1000);
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!TokenStorage.isAccessTokenExpired()) {
      return null;
    }

    if (TokenStorage.isRefreshTokenExpired()) {
      if (this.onLogoutCallback) {
        this.onLogoutCallback();
      }
      return null;
    }

    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise.then(() => null);
    }

    this.refreshPromise = (async (): Promise<boolean> => {
      try {
        const serverPassword = getServerPassword();
        const csrfToken = await getCsrfToken();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (serverPassword) {
          headers["X-Server-Password"] = serverPassword;
        }

        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        }

        const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: "POST",
          headers,
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (this.onLogoutCallback) {
              this.onLogoutCallback();
            }
          }
          return false;
        }

        const data = await response.json();

        if (data.success && data.data?.accessExpiresAt && data.data?.refreshExpiresAt) {
          TokenStorage.saveTokens({
            accessToken: '',
            refreshToken: '',
            accessExpiresAt: data.data.accessExpiresAt,
            refreshExpiresAt: data.data.refreshExpiresAt,
          });

          if (this.onTokenRefreshedCallback) {
            this.onTokenRefreshedCallback();
          }

          return true;
        }

        return false;
      } catch (error) {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    await this.refreshPromise;
    return null;
  }

  async logout(logoutAll: boolean = false): Promise<void> {
    try {
      const serverPassword = getServerPassword();
      const csrfToken = await getCsrfToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (serverPassword) {
        headers["X-Server-Password"] = serverPassword;
      }

      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers,
        body: JSON.stringify({ logoutAll }),
        credentials: "include",
      });
    } catch (error) {
      // Silent
    } finally {
      TokenStorage.clearTokens();
      if (this.refreshIntervalId) {
        clearInterval(this.refreshIntervalId);
        this.refreshIntervalId = null;
      }
    }
  }

  destroy(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.onLogoutCallback = null;
    this.onTokenRefreshedCallback = null;
  }
}

export default TokenManager;
