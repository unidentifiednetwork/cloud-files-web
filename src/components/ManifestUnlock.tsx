"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Lock, 
  Unlock, 
  Loader2, 
  AlertCircle,
  Shield,
  KeyRound
} from "lucide-react";
import { 
  manifestExists, 
  initializeManifest, 
  unlockManifest 
} from "@/lib/manifest";
import { StorageConfig } from "@/lib/settings";

interface ManifestUnlockProps {
  config: StorageConfig;
  onUnlocked: () => void;
}

export function ManifestUnlock({ config, onUnlocked }: ManifestUnlockProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"check" | "create" | "unlock">("check");

  // Check if manifest exists on mount
  useState(() => {
    checkManifest();
  });

  async function checkManifest() {
    setIsLoading(true);
    try {
      const exists = await manifestExists(config);
      setMode(exists ? "unlock" : "create");
    } catch (err) {
      setMode("create");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError("Password is required");
      return;
    }

    if (mode === "create") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === "create") {
        await initializeManifest(config, password);
      } else {
        await unlockManifest(config, password);
      }
      onUnlocked();
    } catch (err) {
      console.error("Manifest error:", err);
      if (mode === "unlock") {
        setError("Wrong password or corrupted manifest");
      } else {
        setError("Failed to create encrypted storage");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (mode === "check") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            {mode === "create" ? (
              <KeyRound className="h-8 w-8 text-white" />
            ) : (
              <Lock className="h-8 w-8 text-white" />
            )}
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {mode === "create" ? "Set Up Encryption" : "Unlock Your Files"}
          </h2>
          <p className="text-sm text-slate-400">
            {mode === "create" 
              ? "Create a password to encrypt your file keys. This password protects access to all your files."
              : "Enter your encryption password to access your files."
            }
          </p>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-600/30 text-amber-300 text-xs mb-6">
          <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {mode === "create" 
              ? "This password cannot be recovered. If you forget it, you will lose access to all your encrypted files."
              : "Your files are end-to-end encrypted. The password never leaves your device."
            }
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-sm mb-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              {mode === "create" ? "Encryption Password" : "Password"}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              className="bg-[#161616] border-[#252525] text-white"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password..."
                className="bg-[#161616] border-[#252525] text-white"
                disabled={isLoading}
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : mode === "create" ? (
              <KeyRound className="h-4 w-4 mr-2" />
            ) : (
              <Unlock className="h-4 w-4 mr-2" />
            )}
            {mode === "create" ? "Create Encrypted Storage" : "Unlock"}
          </Button>
        </form>

        {mode === "unlock" && (
          <p className="text-center text-xs text-slate-500 mt-6">
            Forgot your password? Unfortunately, encrypted files cannot be recovered without it.
          </p>
        )}
      </div>
    </div>
  );
}
