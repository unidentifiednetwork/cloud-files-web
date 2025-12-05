"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { FileUpload, FileUploadHandle } from "@/components/FileUpload";
import { FileManager } from "@/components/FileManager";
import { StorageSettings } from "@/components/StorageSettings";
import { ManifestUnlock } from "@/components/ManifestUnlock";
import { Button } from "@/components/ui/button";
import { 
  CloudUpload, 
  Settings, 
  LogOut, 
  Shield,
  Loader,
  Lock,
  Plus,
  X,
  HardDrive,
  Folder
} from "lucide-react";
import { isStorageConfigured, getStorageConfig } from "@/lib/settings";
import { isManifestUnlocked, lockManifest, getFolders } from "@/lib/manifest";

export default function FilesPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [manifestUnlocked, setManifestUnlocked] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const fileUploadRef = useRef<FileUploadHandle>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    setStorageConfigured(isStorageConfigured());
    setManifestUnlocked(isManifestUnlocked());
  }, [showSettings]);

  const handleLogout = async () => {
    lockManifest();
    await logout();
    router.replace("/login");
  };

  const handleUploadComplete = () => {
    setUploadKey(prev => prev + 1);
    setShowUploadPanel(false);
  };

  const handleConfigSaved = () => {
    setStorageConfigured(isStorageConfigured());
    setManifestUnlocked(false);
  };

  const handleManifestUnlocked = () => {
    setManifestUnlocked(true);
    setUploadKey(prev => prev + 1);
  };

  const handleLockManifest = () => {
    lockManifest();
    setManifestUnlocked(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <Loader className="h-8 w-8 text-white/50 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a] backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-sm sm:text-base font-semibold text-white">UNET Cloud</h1>
            </div>

            {/* Center - Storage info (desktop only) */}
            {manifestUnlocked && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <HardDrive className="h-4 w-4 text-white/40" />
                <span className="text-xs text-white/50">Manifest unlocked</span>
                <div className="w-px h-4 bg-white/10" />
                <Lock className="h-3 w-3 text-emerald-500" />
              </div>
            )}

            {/* User info & actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {manifestUnlocked && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLockManifest}
                  className="text-white/40 hover:text-amber-400 h-8 w-8 sm:h-9 sm:w-9"
                  title="Lock files"
                >
                  <Lock className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(true)}
                className="text-white/40 hover:text-white h-8 w-8 sm:h-9 sm:w-9"
                title="Storage Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>

              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-sm text-white/70">{user.username}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-white/40 hover:text-red-400 h-8 w-8 sm:h-9 sm:w-9"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {!storageConfigured ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-20">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 sm:mb-6">
              <CloudUpload className="h-8 w-8 sm:h-10 sm:w-10 text-white/30" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Configure Your Storage</h2>
            <p className="text-sm sm:text-base text-white/50 text-center max-w-md mb-4 sm:mb-6 px-4">
              Set up your S3-compatible storage to start uploading encrypted files.
            </p>
            <Button
              onClick={() => setShowSettings(true)}
              className="bg-white text-black hover:bg-white/90"
            >
              <Settings className="h-4 w-4 mr-2" />
              Open Settings
            </Button>
          </div>
        ) : !manifestUnlocked ? (
          <ManifestUnlock 
            config={getStorageConfig()!} 
            onUnlocked={handleManifestUnlocked} 
          />
        ) : (
          <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]">
            <FileManager 
              refreshTrigger={uploadKey} 
              onFolderChange={setCurrentFolderId}
            />
          </div>
        )}
      </main>

      {/* Upload FAB */}
      {manifestUnlocked && !showUploadPanel && (
        <button
          onClick={() => setShowUploadPanel(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-30"
        >
          <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Upload Panel */}
      {showUploadPanel && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUploadPanel(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-white/[0.06] rounded-t-2xl p-4 sm:p-6 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                  <CloudUpload className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white">Upload Files</h3>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span>End-to-end encrypted</span>
                    {currentFolderId && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-sky-400">
                          <Folder className="h-3 w-3" />
                          {getFolders().find(f => f.id === currentFolderId)?.name || 'Folder'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowUploadPanel(false)}
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <FileUpload 
              ref={fileUploadRef} 
              onUploadComplete={handleUploadComplete} 
              currentFolderId={currentFolderId}
            />
          </div>
        </div>
      )}

      <StorageSettings 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onConfigSaved={handleConfigSaved}
      />
    </div>
  );
}
