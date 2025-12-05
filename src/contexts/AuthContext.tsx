"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { User } from "@/lib/types";
import { getPrivateKey, clearKeyPair } from "@/lib/crypto";
import { TokenStorage } from "@/lib/tokenStorage";
import TokenManager from "@/lib/tokenManager";
import { getApiBaseUrl, getServerPassword } from "@/lib/settings";
import { extractCsrfTokenFromResponse, initializeCsrfToken, clearCsrfToken } from "@/lib/csrf";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  publicKey: string | null;
  login: (user: User, tokens: AuthTokens) => void;
  logout: (logoutAll?: boolean) => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  isTokenExpired: (expiresAt: string | null) => boolean;
  getPrivateKeyForSigning: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [refreshExpiresAt, setRefreshExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const hasInitialized = useRef(false);

  const isTokenExpired = useCallback((expiresAt: string | null): boolean => {
    if (!expiresAt) return true;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const timeLeft = expiry.getTime() - now.getTime();
    return timeLeft < 2 * 60 * 1000;
  }, []);

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const handleWebSocketAuthError = () => {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setAccessExpiresAt(null);
      setRefreshExpiresAt(null);
      setPublicKey(null);
      TokenStorage.clearTokens();
      localStorage.removeItem("auth_user");
    };

    window.addEventListener('websocket-auth-error', handleWebSocketAuthError);

    const initializeAuth = async () => {
      try {
        await initializeCsrfToken();
      } catch (error) {
        console.error("Failed to initialize CSRF token:", error);
      }

      try {
        const apiUrl = `${getApiBaseUrl()}/profiles/me`;

        const response = await fetch(apiUrl, {
          method: "GET",
          credentials: 'include',
          headers: {
            "Accept": "application/json",
          },
          cache: 'no-store',
        });

        extractCsrfTokenFromResponse(response);

        if (response.ok) {
          const data = await response.json();
          const userData: User = data.data;
          setUser(userData);
          setPublicKey(userData.publicKey || null);
          localStorage.setItem("auth_user", JSON.stringify(userData));

          let accessExpiresAt: string | null = null;
          let refreshExpiresAt: string | null = null;

          if (data.auth?.accessExpiresAt && data.auth?.refreshExpiresAt) {
            accessExpiresAt = data.auth.accessExpiresAt;
            refreshExpiresAt = data.auth.refreshExpiresAt;
          }

          if (!accessExpiresAt || !refreshExpiresAt) {
            const accessExpHeader = response.headers.get('X-Access-Token-Expires-At');
            const refreshExpHeader = response.headers.get('X-Refresh-Token-Expires-At');
            if (accessExpHeader) accessExpiresAt = accessExpHeader;
            if (refreshExpHeader) refreshExpiresAt = refreshExpHeader;
          }

          if (accessExpiresAt && refreshExpiresAt) {
            TokenStorage.saveTokens({
              accessToken: '',
              refreshToken: '',
              accessExpiresAt,
              refreshExpiresAt,
            });
            setAccessExpiresAt(accessExpiresAt);
            setRefreshExpiresAt(refreshExpiresAt);
          } else {
            const savedAccessExpiresAt = TokenStorage.getAccessExpiresAt();
            const savedRefreshExpiresAt = TokenStorage.getRefreshExpiresAt();

            if (savedAccessExpiresAt) {
              setAccessExpiresAt(savedAccessExpiresAt.toISOString());
            }
            if (savedRefreshExpiresAt) {
              setRefreshExpiresAt(savedRefreshExpiresAt.toISOString());
            }
          }

          const tokenManager = TokenManager.getInstance();
          tokenManager.initialize(
            () => {
              setUser(null);
              setAccessToken(null);
              setRefreshToken(null);
              setAccessExpiresAt(null);
              setRefreshExpiresAt(null);
              setPublicKey(null);
              TokenStorage.clearTokens();
              localStorage.removeItem("auth_user");
            },
            () => {
              const newExpiresAt = TokenStorage.getAccessExpiresAt();
              if (newExpiresAt) {
                setAccessExpiresAt(newExpiresAt.toISOString());
              }
              const newRefreshExpiresAt = TokenStorage.getRefreshExpiresAt();
              if (newRefreshExpiresAt) {
                setRefreshExpiresAt(newRefreshExpiresAt.toISOString());
              }
            }
          );

          setIsInitialized(true);
        } else if (response.status === 401 || response.status === 403) {
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
          setAccessExpiresAt(null);
          setRefreshExpiresAt(null);
          setPublicKey(null);
          TokenStorage.clearTokens();
          localStorage.removeItem("auth_user");
          setIsInitialized(true);
        } else {
          setIsInitialized(true);
        }
      } catch (error) {
        setIsInitialized(true);
      }
    };

    initializeAuth().catch(() => {});

    return () => {
      window.removeEventListener('websocket-auth-error', handleWebSocketAuthError);
    };
  }, []);

  const login = (user: User, tokens: AuthTokens) => {
    TokenStorage.saveTokens({
      accessToken: '',
      refreshToken: '',
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
    });

    localStorage.setItem("auth_user", JSON.stringify(user));

    setUser(user);
    setAccessExpiresAt(tokens.accessExpiresAt);
    setRefreshExpiresAt(tokens.refreshExpiresAt);
    setPublicKey(user.publicKey);

    const tokenManager = TokenManager.getInstance();
    tokenManager.initialize(
      () => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        setAccessExpiresAt(null);
        setRefreshExpiresAt(null);
        setPublicKey(null);
      },
      () => {
        const newExpiresAt = TokenStorage.getAccessExpiresAt();
        if (newExpiresAt) {
          setAccessExpiresAt(newExpiresAt.toISOString());
        }
      }
    );
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    const tokenManager = TokenManager.getInstance();
    try {
      await tokenManager.getValidAccessToken();
      const newExpiresAt = TokenStorage.getAccessExpiresAt();
      if (newExpiresAt) {
        setAccessExpiresAt(newExpiresAt.toISOString());
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  const logout = async (logoutAll: boolean = false) => {
    setIsLoading(true);

    try {
      const tokenManager = TokenManager.getInstance();
      await tokenManager.logout(logoutAll);
    } catch (error) {
      // Silent
    } finally {
      if (user?.id) {
        clearKeyPair(user.id);
      }

      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setAccessExpiresAt(null);
      setRefreshExpiresAt(null);
      setPublicKey(null);

      TokenStorage.clearTokens();

      try {
        localStorage.removeItem("auth_user");
        localStorage.removeItem("session_id");
        clearCsrfToken();
      } catch (e) {
        // Silent
      }

      setIsLoading(false);

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  const getPrivateKeyForSigning = async (): Promise<string | null> => {
    if (!user?.id) {
      return null;
    }

    const privateKey = await getPrivateKey(user.id);
    return privateKey;
  };

  const refreshUser = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }

    try {
      const serverPassword = getServerPassword();
      const headers: HeadersInit = {};
      if (serverPassword) {
        headers['X-Server-Password'] = serverPassword;
      }

      const response = await fetch(`${getApiBaseUrl()}/profiles/me`, {
        method: "GET",
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const updatedUser: User = data.data;

      setUser(updatedUser);
      localStorage.setItem("auth_user", JSON.stringify(updatedUser));

      if (updatedUser.publicKey) {
        setPublicKey(updatedUser.publicKey);
      }
    } catch (error) {
      // Silent
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        accessExpiresAt,
        refreshExpiresAt,
        isLoading,
        isInitialized,
        publicKey,
        login,
        logout,
        refreshAccessToken,
        refreshUser,
        isTokenExpired,
        getPrivateKeyForSigning,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
