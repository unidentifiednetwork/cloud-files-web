"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, AlertCircle, Loader2, Copy, Check, Shield, Key, User, Lock, Cloud, Server, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  checkUsernameAvailable,
  registerUser,
  getLoginChallenge,
  verifyLoginSignature,
  checkInviteOnlyMode,
  validateInvitationCode,
} from "@/lib/api";
import {
  signMessage,
  storeKeyPair,
  generateKeyPair,
} from "@/lib/crypto";
import { isElectronApp } from "@/lib/utils";
import { PREDEFINED_SERVERS, getCurrentServerId, setServerById, getApiBaseUrl } from "@/lib/settings";

export default function LoginPage() {
  const [step, setStep] = useState<
    | "login"
    | "login-with-key"
    | "2fa-verify"
    | "register-choose-username"
    | "register-loading"
    | "login-setup"
  >("login");
  const [username, setUsername] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [inviteOnlyMode, setInviteOnlyMode] = useState(false);
  const [inviteValid, setInviteValid] = useState<{
    valid: boolean;
    reason?: string;
    expiresAt?: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedKeyPair, setGeneratedKeyPair] = useState<{
    privateKey: string;
    publicKey: string;
  } | null>(null);
  const [copied, setCopied] = useState<"private" | "public" | null>(null);
  const [challengeData, setChallengeData] = useState<{
    challenge: string;
    publicKey: string;
  } | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState("unet-main");
  const [customServerUrl, setCustomServerUrl] = useState("");
  const [showServerSelect, setShowServerSelect] = useState(false);
  const router = useRouter();
  const { login: authLogin, user, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    if (user && step !== "login-setup") {
      router.replace("/files");
    }
  }, [user, isInitialized, router, step]);

  useEffect(() => {
    checkInviteMode();
    setIsElectron(isElectronApp());
    // Load current server selection
    const currentId = getCurrentServerId();
    setSelectedServerId(currentId);
    if (currentId === "custom") {
      setCustomServerUrl(getApiBaseUrl());
    }
  }, []);

  const checkInviteMode = async () => {
    try {
      const res = await checkInviteOnlyMode();
      setInviteOnlyMode(res.data.inviteOnlyMode);
    } catch (err) {
      console.error("Failed to check invite mode:", err);
    }
  };

  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId);
    setShowServerSelect(false);
    if (serverId !== "custom") {
      setServerById(serverId);
      // Re-check invite mode for new server
      checkInviteMode();
    }
  };

  const handleCustomServerSave = () => {
    if (customServerUrl.trim()) {
      setServerById("custom", customServerUrl.trim());
      setShowServerSelect(false);
      // Re-check invite mode for new server
      checkInviteMode();
    }
  };

  const handleInviteCodeChange = async (value: string) => {
    setInvitationCode(value);

    if (value.length === 0) {
      setInviteValid(null);
      return;
    }

    try {
      const res = await validateInvitationCode(value);
      if (res.data.isValid) {
        setInviteValid({
          valid: true,
          expiresAt: res.data.expiresAt,
        });
      } else {
        setInviteValid({
          valid: false,
          reason: res.data.reason,
        });
      }
    } catch (err) {
      console.error("Error validating invite:", err);
      setInviteValid({
        valid: false,
        reason: "Failed to validate code",
      });
    }
  };

  const handleLoginStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const challengeRes = await getLoginChallenge(username);
      const challenge = challengeRes.data.challenge;
      const publicKey = challengeRes.data.publicKey;

      setChallengeData({ challenge, publicKey });
      setStep("login-with-key");
    } catch (err) {
      console.error("Login error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get login challenge."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!challengeData) {
        throw new Error("Challenge data not found");
      }

      const signature = await signMessage(privateKey, challengeData.challenge);

      const verifyRes = await verifyLoginSignature(username, signature);

      if (!verifyRes.success && verifyRes.requires2FA) {
        setLastSignature(signature);
        setTwoFactorToken("");
        setStep("2fa-verify");
        setIsLoading(false);
        return;
      }

      if (verifyRes.success && verifyRes.auth) {
        const userData = verifyRes.user!;
        const tokens = verifyRes.auth;

        await storeKeyPair(userData.id, privateKey, userData.publicKey);

        const user = {
          id: userData.id,
          username: userData.username,
          publicKey: userData.publicKey,
        };

        authLogin(user, tokens);
        setPrivateKey("");
        router.push("/files");
      }
    } catch (err) {
      console.error("Signature verification error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Signature verification failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!lastSignature || !twoFactorToken.trim()) {
        throw new Error("Invalid 2FA code");
      }

      const verifyRes = await verifyLoginSignature(
        username,
        lastSignature,
        twoFactorToken
      );

      if (verifyRes.success && verifyRes.auth) {
        const userData = verifyRes.user!;
        const tokens = verifyRes.auth;

        await storeKeyPair(userData.id, privateKey, userData.publicKey);

        const user = {
          id: userData.id,
          username: userData.username,
          publicKey: userData.publicKey,
        };

        authLogin(user, tokens);
        setTwoFactorToken("");
        setLastSignature(null);
        setPrivateKey("");
        router.push("/files");
      } else {
        setError("Invalid 2FA code. Please try again.");
        setTwoFactorToken("");
      }
    } catch (err) {
      console.error("2FA verification error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "2FA verification failed. Please try again."
      );
      setTwoFactorToken("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const checkRes = await checkUsernameAvailable(username);
      if (!checkRes.data.available) {
        setError("Username already taken. Please choose another.");
        setIsLoading(false);
        return;
      }

      setStep("register-choose-username");
      setIsLoading(false);
    } catch (err) {
      console.error("Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to check username availability."
      );
      setIsLoading(false);
    }
  };

  const handleRegisterConfirm = async () => {
    setError("");
    setIsLoading(true);
    setStep("register-loading");

    try {
      const keyPair = await generateKeyPair();

      const registerRes = await registerUser(
        username,
        keyPair.publicKey,
        invitationCode || undefined
      );

      if (registerRes.success) {
        const userData = registerRes.user;
        const tokens = registerRes.auth;

        await storeKeyPair(userData.id, keyPair.privateKey, userData.publicKey);

        const user = {
          id: userData.id,
          username: userData.username,
          publicKey: userData.publicKey,
        };

        authLogin(user, tokens);

        setGeneratedKeyPair({
          privateKey: keyPair.privateKey,
          publicKey: userData.publicKey,
        });

        setStep("login-setup");
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again."
      );
      setStep("register-choose-username");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "private" | "public") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // 2FA Verification UI
  if (step === "2fa-verify") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="h-6 w-6 text-green-400" />
              <h1 className="text-3xl font-bold text-white">2FA Verification</h1>
            </div>
            <p className="text-slate-400">
              Enter the 6-digit code from your authenticator app or a backup code
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handle2FAVerify} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="twoFactorCode" className="text-white">
                Authentication Code
              </Label>
              <input
                id="twoFactorCode"
                type="text"
                value={twoFactorToken}
                onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full bg-[#161616] border border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 focus:outline-none rounded-lg px-4 py-3 font-mono text-2xl tracking-widest text-center"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500 text-center">
                Enter 6-digit TOTP code or 8-character backup code
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-[#252525] bg-[#161616] text-slate-400 hover:bg-[#1a1a1a] hover:text-white"
                onClick={() => {
                  setStep("login-with-key");
                  setTwoFactorToken("");
                  setLastSignature(null);
                  setError("");
                }}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-white text-black hover:bg-slate-200 gap-2"
                disabled={isLoading || twoFactorToken.length < 6}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    Verify <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === "login-setup" && generatedKeyPair) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
              <h1 className="text-3xl font-bold text-white">Account Created!</h1>
            </div>
            <p className="text-slate-400">
              Your cryptographic keys have been generated. Save them securely.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-[#161616] border border-[#252525] rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-400" />
                  <Label className="text-white font-semibold">Public Key</Label>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(generatedKeyPair.publicKey, "public")}
                  className="text-xs text-slate-400 hover:text-white hover:bg-[#252525]"
                >
                  {copied === "public" ? (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="font-mono text-xs bg-[#0f0f0f] p-4 rounded border border-[#252525] text-slate-300 break-all">
                {generatedKeyPair.publicKey}
              </div>
              <p className="text-xs text-slate-500 mt-2">✓ Safe to share publicly</p>
            </div>

            <div className="bg-[#161616] border border-red-900/50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-red-400" />
                  <Label className="text-red-300 font-semibold">Private Key</Label>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(generatedKeyPair.privateKey, "private")}
                  className="text-xs text-slate-400 hover:text-white hover:bg-[#252525]"
                >
                  {copied === "private" ? (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="font-mono text-xs bg-[#0f0f0f] p-4 rounded border border-red-900/50 text-slate-300 break-all">
                {generatedKeyPair.privateKey}
              </div>
              <p className="text-xs text-red-400 mt-2">⚠️ NEVER share this key with anyone!</p>
            </div>
          </div>

          <Button
            onClick={() => {
              setGeneratedKeyPair(null);
              router.push("/files");
            }}
            className="w-full bg-white text-black hover:bg-slate-200 gap-2"
            size="lg"
          >
            Continue to Cloud <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === "register-choose-username") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Confirm Username</h1>
            <p className="text-slate-400">
              This username will be your public identity
            </p>
          </div>

          <div className="bg-[#161616] border border-[#252525] rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <User className="h-5 w-5 text-slate-400" />
              <p className="text-sm text-slate-400">Your Username</p>
            </div>
            <p className="text-3xl font-bold text-white">@{username}</p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-[#252525] bg-[#161616] text-slate-400 hover:bg-[#1a1a1a] hover:text-white"
              onClick={() => {
                setStep("login");
                setUsername("");
                setError("");
              }}
              disabled={isLoading}
            >
              Go Back
            </Button>
            <Button
              onClick={handleRegisterConfirm}
              className="flex-1 bg-white text-black hover:bg-slate-200 gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  Create Account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "login-with-key" && challengeData) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Sign Challenge</h1>
            <p className="text-slate-400">
              Prove ownership by signing with your private key
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <div className="bg-[#161616] border border-[#252525] rounded-lg p-6 mb-6">
            <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Challenge to sign:</p>
            <div className="font-mono text-xs bg-[#0f0f0f] p-4 rounded border border-[#252525] text-slate-300 break-all max-h-24 overflow-y-auto">
              {challengeData.challenge}
            </div>
          </div>

          <form onSubmit={handleLoginWithKey} className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-slate-400" />
                <Label htmlFor="privateKey" className="text-white">
                  Your Private Key
                </Label>
              </div>
              <textarea
                id="privateKey"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Paste your 64-character private key..."
                className="w-full h-24 bg-[#161616] border border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 focus:outline-none rounded-lg px-4 py-3 font-mono text-sm resize-none"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-[#252525] bg-[#161616] text-slate-400 hover:bg-[#1a1a1a] hover:text-white"
                onClick={() => {
                  setStep("login");
                  setPrivateKey("");
                  setChallengeData(null);
                  setError("");
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-white text-black hover:bg-slate-200 gap-2"
                disabled={isLoading || !privateKey.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing...
                  </>
                ) : (
                  <>
                    Sign & Login <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header with Cloud branding */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Cloud className="h-10 w-10 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Cloud</h1>
          </div>
          <p className="text-slate-400">
            E2EE cloud storage powered by UNET
          </p>
        </div>

        {/* Invite-Only Mode Info */}
        {inviteOnlyMode && (
          <div className="mb-6 bg-blue-950/30 border border-blue-900/50 rounded-lg p-4 flex gap-3">
            <Lock className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 text-sm font-semibold">Registration by invitation only</p>
              <p className="text-blue-400/70 text-xs mt-1">
                You need an invitation code to create an account
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginStart} className="space-y-6 mb-6">
          {/* Server Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-400" />
              <Label className="text-white">Server</Label>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowServerSelect(!showServerSelect)}
                className="w-full flex items-center justify-between bg-[#161616] border border-[#252525] text-white h-12 px-4 rounded-md hover:border-slate-600 transition-colors"
              >
                <span className="text-sm">
                  {PREDEFINED_SERVERS.find(s => s.id === selectedServerId)?.name || "Select Server"}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showServerSelect ? 'rotate-180' : ''}`} />
              </button>
              
              {showServerSelect && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#161616] border border-[#252525] rounded-lg overflow-hidden z-50 shadow-xl">
                  {PREDEFINED_SERVERS.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => server.id !== "custom" ? handleServerChange(server.id) : setSelectedServerId("custom")}
                      className={`w-full text-left px-4 py-3 hover:bg-[#1f1f1f] transition-colors ${
                        selectedServerId === server.id ? 'bg-[#1f1f1f] border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <p className="text-sm text-white font-medium">{server.name}</p>
                      {server.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{server.description}</p>
                      )}
                    </button>
                  ))}
                  
                  {/* Custom server input */}
                  {selectedServerId === "custom" && (
                    <div className="p-3 border-t border-[#252525]">
                      <Input
                        type="url"
                        value={customServerUrl}
                        onChange={(e) => setCustomServerUrl(e.target.value)}
                        placeholder="https://your-server.com/api"
                        className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 h-10 mb-2"
                      />
                      <Button
                        type="button"
                        onClick={handleCustomServerSave}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-9"
                        disabled={!customServerUrl.trim()}
                      >
                        Use This Server
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <Label htmlFor="username" className="text-white">
                Username
              </Label>
            </div>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="bg-[#161616] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 h-12"
              disabled={isLoading}
            />
          </div>

          {inviteOnlyMode && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" />
                <Label htmlFor="inviteCode" className="text-white">
                  Invitation Code
                </Label>
              </div>
              <Input
                id="inviteCode"
                type="text"
                value={invitationCode}
                onChange={(e) => handleInviteCodeChange(e.target.value)}
                placeholder="ABC123DEF456GHI789JKL012"
                className="bg-[#161616] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 h-12 font-mono text-sm"
                disabled={isLoading}
              />

              {inviteValid !== null && invitationCode.length > 0 && (
                <div className="text-sm">
                  {inviteValid.valid ? (
                    <p className="text-green-400 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      Valid invitation code
                      {inviteValid.expiresAt && (
                        <span className="text-slate-400 ml-1">
                          (expires {new Date(inviteValid.expiresAt).toLocaleDateString()})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {inviteValid.reason || "Invalid invitation code"}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-white text-black hover:bg-slate-200 gap-2 h-12"
            disabled={isLoading || (!isElectron && !username.trim())}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Getting Challenge...
              </>
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#252525]"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0f0f0f] px-3 text-slate-500">New here?</span>
          </div>
        </div>

        {/* Register Button */}
        <Button
          onClick={async () => {
            setError("");
            if (!username.trim()) {
              setError("Please enter a username");
              return;
            }
            if (inviteOnlyMode && !invitationCode.trim()) {
              setError("Please enter an invitation code");
              return;
            }
            if (inviteOnlyMode && inviteValid && !inviteValid.valid) {
              setError("Please enter a valid invitation code");
              return;
            }
            await handleRegisterStart(new Event("submit") as any);
          }}
          variant="outline"
          className="w-full border-[#252525] bg-[#161616] text-white hover:bg-[#1a1a1a] h-12"
          disabled={isLoading}
        >
          Create Account
        </Button>

        {/* Info banner */}
        <div className="mt-8 p-4 rounded-lg bg-blue-950/20 border border-blue-900/30">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 text-sm font-medium">End-to-End Encrypted</p>
              <p className="text-blue-400/70 text-xs mt-1">
                Your files are encrypted locally before upload. Only you have the keys.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
