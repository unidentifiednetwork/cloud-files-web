"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  Download,
  Eye,
  Lock,
  Loader,
  AlertCircle,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  X,
  StickyNote,
  Tag
} from "lucide-react";
import {
  bytesToBase64,
  base64ToBytes,
  decryptFile,
  deriveShareKey,
  decryptJson,
  decryptBytes
} from "@/lib/e2ee";
import { decryptSharedNote } from "@/lib/notes";
import { formatBytes } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ShareBundle {
  v: number;
  fileName: string;
  mimeType: string;
  presignedUrl: string;
  encFileKeyBase64: string;
  encFileNonceBase64: string;
}

interface SharedNoteData {
  title: string;
  content: string;
  tags: string[];
}

function SharePageContent() {
  const searchParams = useSearchParams();
  const bundleB64 = searchParams.get("s");
  const noteBundle = searchParams.get("note");
  
  // Determine share type
  const shareType = noteBundle ? "note" : "file";

  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "accessing" | "preview" | "downloading" | "error">("password");
  const [error, setError] = useState("");
  const [fileData, setFileData] = useState<{ url?: string; name: string; type: string; size: number; textContent?: string; presignedUrl?: string; fileKeyBase64?: string; fileNonceBase64?: string } | null>(null);
  const [noteData, setNoteData] = useState<SharedNoteData | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showAppBanner, setShowAppBanner] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Detect Android and show app banner
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const android = /android/i.test(userAgent);
    setIsAndroid(android);
    
    // Show banner on Android devices (for both files and notes)
    if (android && (bundleB64 || noteBundle)) {
      const dismissed = sessionStorage.getItem('app_banner_dismissed');
      if (!dismissed) {
        setShowAppBanner(true);
      }
    }
  }, [bundleB64, noteBundle]);

  const getAppDeepLink = useCallback(() => {
    if (noteBundle) {
      return `unetcloud://share?note=${encodeURIComponent(noteBundle)}`;
    }
    if (!bundleB64) return '';
    // Deep link for the app
    return `unetcloud://share?s=${encodeURIComponent(bundleB64)}`;
  }, [bundleB64, noteBundle]);

  const getIntentUrl = useCallback(() => {
    // Use the web share URL as a safe browser fallback when app isn't installed
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://cloud.unet.live';
    if (noteBundle) {
      const fallbackUrl = `${fallbackOrigin}/share?note=${encodeURIComponent(noteBundle)}`;
      return `intent://share?note=${encodeURIComponent(noteBundle)}#Intent;scheme=unetcloud;package=com.unet.cloud;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
    }
    if (!bundleB64) return '';
    // Android Intent URL - tries to open app, falls back to the web share page
    const fallbackUrl = `${fallbackOrigin}/share?s=${encodeURIComponent(bundleB64)}`;
    return `intent://share?s=${encodeURIComponent(bundleB64)}#Intent;scheme=unetcloud;package=com.unet.cloud;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  }, [bundleB64, noteBundle]);

  const handleOpenInApp = useCallback(() => {
    if (isAndroid) {
      // Try Intent URL for Android
      window.location.href = getIntentUrl();
    } else {
      // For other platforms, try deep link
      window.location.href = getAppDeepLink();
    }
  }, [isAndroid, getIntentUrl, getAppDeepLink]);

  const dismissBanner = useCallback(() => {
    setShowAppBanner(false);
    sessionStorage.setItem('app_banner_dismissed', 'true');
  }, []);

  const handleAccess = useCallback(async () => {
    if (!password) {
      setError("Enter password");
      setStep("error");
      return;
    }

    // Handle note sharing
    if (shareType === "note" && noteBundle) {
      setStep("accessing");
      setError("");
      setProgress(50);

      try {
        const result = await decryptSharedNote(noteBundle, password);
        if (!result) {
          throw new Error("Invalid password or corrupted note");
        }
        
        setNoteData(result);
        setStep("preview");
        setProgress(100);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Invalid password';
        setError(errorMessage);
        setStep("error");
        setProgress(0);
      }
      return;
    }

    // Handle file sharing
    if (!bundleB64) {
      setError("Enter password and valid link");
      setStep("error");
      return;
    }

    setStep("accessing");
    setError("");
    setProgress(0);

    try {
      const parts = bundleB64.split('.');
      if (parts.length !== 2) throw new Error('Invalid share link format');

      const saltB64 = parts[0];
      const encInnerB64 = parts[1];

      const salt = base64ToBytes(saltB64);
      const shareKey = await deriveShareKey(password, salt);

      const encInner = base64ToBytes(encInnerB64);
      const innerBundle = await decryptJson(encInner, shareKey) as ShareBundle;

      if (innerBundle.v !== 1) throw new Error('Unsupported share version');

      setProgress(30);

      const fileKeyEnc = base64ToBytes(innerBundle.encFileKeyBase64);
      const fileKeyBytes = await decryptBytes(fileKeyEnc, shareKey);
      const fileKeyBase64 = bytesToBase64(fileKeyBytes);

      const fileNonceEnc = base64ToBytes(innerBundle.encFileNonceBase64);
      const fileNonceBytes = await decryptBytes(fileNonceEnc, shareKey);
      const fileNonceBase64 = bytesToBase64(fileNonceBytes);

      setProgress(80);

      // Get file size from presigned URL headers
      let fileSize = 0;
      try {
        const headResponse = await fetch(innerBundle.presignedUrl, { method: 'HEAD' });
        fileSize = parseInt(headResponse.headers.get('content-length') || '0', 10);
      } catch (err) {
        // If HEAD fails, we'll get size on download
        fileSize = 0;
      }

      setProgress(85);

      // For small files (images/videos < 10MB), download and decrypt immediately for preview
      const isSmallPreviewable = (innerBundle.mimeType.startsWith('image/') || innerBundle.mimeType.startsWith('video/')) && fileSize < 10 * 1024 * 1024;

      if (isSmallPreviewable) {
        try {
          const response = await fetch(innerBundle.presignedUrl);
          if (!response.ok) throw new Error('File not found or link expired');
          const encryptedData = new Uint8Array(await response.arrayBuffer());

          setProgress(95);

          const decryptedData = await decryptFile(encryptedData, fileKeyBase64, fileNonceBase64);
          const blob = new Blob([decryptedData], { type: innerBundle.mimeType });
          const url = URL.createObjectURL(blob);

          setFileData({
            url,
            name: innerBundle.fileName,
            type: innerBundle.mimeType,
            size: fileSize || decryptedData.byteLength,
            presignedUrl: innerBundle.presignedUrl,
            fileKeyBase64,
            fileNonceBase64,
          });
        } catch (err) {
          // If preview fails, fall back to metadata only
          setFileData({
            name: innerBundle.fileName,
            type: innerBundle.mimeType,
            size: fileSize,
            presignedUrl: innerBundle.presignedUrl,
            fileKeyBase64,
            fileNonceBase64,
          });
        }
      } else {
        // Store metadata for preview - don't download/decrypt full file yet
        setFileData({
          name: innerBundle.fileName,
          type: innerBundle.mimeType,
          size: fileSize,
          presignedUrl: innerBundle.presignedUrl,
          fileKeyBase64,
          fileNonceBase64,
        });
      }

      setStep("preview");
      setProgress(100);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid password or expired link';
      setError(errorMessage);
      setStep("error");
      setProgress(0);
    }
  }, [password, bundleB64, shareType, noteBundle]);

  const handleDownload = async () => {
    if (!fileData || !fileData.presignedUrl || !fileData.fileKeyBase64 || !fileData.fileNonceBase64) return;
    
    setStep("downloading");
    setProgress(10);

    try {
      // Download encrypted file with progress tracking
      const xhr = new XMLHttpRequest();

      const encryptedData = await new Promise<Uint8Array>((resolve, reject) => {
        xhr.open('GET', fileData.presignedUrl!, true);
        xhr.responseType = 'arraybuffer';

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 40 + 10; // 10-50%
            setProgress(percentComplete);
          } else {
            // No length info, just show incremental progress
            setProgress(Math.min(40, Math.random() * 30 + 10));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(new Uint8Array(xhr.response));
          } else {
            reject(new Error('File not found or link expired'));
          }
        };

        xhr.onerror = () => reject(new Error('Failed to download file'));
        xhr.onabort = () => reject(new Error('Download cancelled'));
        xhr.send();
      });

      setProgress(55);

      // Decrypt file
      const decryptedData = await decryptFile(encryptedData, fileData.fileKeyBase64, fileData.fileNonceBase64);

      setProgress(90);

      // Create blob and download
      const blob = new Blob([decryptedData], { type: fileData.type });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileData.name;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      
      setTimeout(() => {
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStep("preview");
          setProgress(100);
        }, 100);
      }, 0);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      setError(errorMessage);
      setStep("error");
      setProgress(0);
    }
  };

  const handleLoadPreview = async () => {
    if (!fileData || !fileData.presignedUrl || !fileData.fileKeyBase64 || !fileData.fileNonceBase64) return;
    
    setLoadingPreview(true);

    try {
      // Download encrypted file with progress tracking
      const xhr = new XMLHttpRequest();

      const encryptedData = await new Promise<Uint8Array>((resolve, reject) => {
        xhr.open('GET', fileData.presignedUrl!, true);
        xhr.responseType = 'arraybuffer';

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 50; // 0-50%
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(new Uint8Array(xhr.response));
          } else {
            reject(new Error('File not found or link expired'));
          }
        };

        xhr.onerror = () => reject(new Error('Failed to load preview'));
        xhr.onabort = () => reject(new Error('Preview cancelled'));
        xhr.send();
      });

      // Decrypt file
      const decryptedData = await decryptFile(encryptedData, fileData.fileKeyBase64, fileData.fileNonceBase64);
      const blob = new Blob([decryptedData], { type: fileData.type });
      const url = URL.createObjectURL(blob);

      // Update fileData with URL for preview
      setFileData(prev => prev ? { ...prev, url } : null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load preview';
      setError(errorMessage);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/share?s=${bundleB64}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyNoteContent = () => {
    if (!noteData) return;
    navigator.clipboard.writeText(noteData.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return ImageIcon;
    if (mimeType.startsWith("text/")) return FileText;
    return FileIcon;
  };

  if (!bundleB64 && !noteBundle) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-white/30" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Share Link</h1>
          <p className="text-sm text-white/50 mb-6">This link is incomplete or invalid.</p>
          <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-400 text-xs">
            Missing share parameter
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Android App Banner */}
      {showAppBanner && (
        <div className="bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border-b border-sky-500/20">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-6 h-6">
                    <path 
                      d="M50 25C45 25 41 27 38 30C35 33 33 38 33 45C33 52 35 58 40 62C45 66 52 70 60 73C52 73 45 72 40 70C35 68 31 65 28 61C25 57 23 52 23 45C23 38 25 32 29 27C33 22 39 20 47 20C55 20 61 22 66 26C71 30 74 36 75 43C75 50 73 56 69 61C65 66 59 70 51 73C59 70 65 66 69 61C73 56 75 50 75 43C75 36 73 31 69 27C65 23 59 21 51 21C49 21 48 21 47 21"
                      fill="white"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">UNET Cloud</p>
                  <p className="text-xs text-white/50">Open in app</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={handleOpenInApp}
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-600 text-white h-8 px-4 text-xs font-medium"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Open
                </Button>
                <button
                  onClick={dismissBanner}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a] backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-sm sm:text-base font-semibold text-white">UNET Cloud</h1>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <Lock className="h-3 w-3 text-emerald-500" />
              <span className="text-xs text-white/50">E2EE Share</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto">
          {step === "password" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  {shareType === "note" ? (
                    <StickyNote className="h-8 w-8 sm:h-10 sm:w-10 text-amber-500/50" />
                  ) : (
                    <Lock className="h-8 w-8 sm:h-10 sm:w-10 text-white/30" />
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">
                  {shareType === "note" ? "Encrypted Note" : "Encrypted File"}
                </h2>
                <p className="text-sm text-white/50">Enter password to decrypt and access</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 mb-2 block">Password</label>
                  <Input
                    type="password"
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && password && handleAccess()}
                    className="bg-white/[0.03] border-white/[0.06] text-white h-11 focus:border-white/20 focus:ring-0"
                    autoFocus
                  />
                </div>

                <Button
                  onClick={handleAccess}
                  disabled={!password}
                  className={`w-full h-11 shadow-lg disabled:opacity-50 ${
                    shareType === "note"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/25"
                      : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-sky-500/25"
                  }`}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {shareType === "note" ? "Unlock Note" : "Unlock File"}
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleCopyLink}
                  className="w-full h-10 text-white/40 hover:text-white hover:bg-white/[0.03]"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>

                {isAndroid && (
                  <Button
                    variant="outline"
                    onClick={handleOpenInApp}
                    className="w-full h-10 border-sky-500/30 text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/50"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Open in App
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === "accessing" && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <Loader className="h-8 w-8 text-white/50 animate-spin" />
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-2">Verifying and loading...</h2>
                <p className="text-sm text-white/40">Decrypting metadata</p>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={progress} className="h-2 bg-white/[0.06]" />
                <p className="text-xs text-white/30 mt-2 text-center">{Math.round(progress)}%</p>
              </div>
            </div>
          )}

          {step === "downloading" && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <Loader className="h-8 w-8 text-white/50 animate-spin" />
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-2">Downloading & decrypting file...</h2>
                <p className="text-sm text-white/40">This may take a moment</p>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={progress} className="h-2 bg-white/[0.06]" />
                <p className="text-xs text-white/30 mt-2 text-center">{Math.round(progress)}%</p>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="text-center space-y-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white mb-2">Access Denied</h2>
                <p className="text-sm text-white/50 max-w-md mx-auto">{error}</p>
              </div>
              <Button
                onClick={() => setStep("password")}
                variant="outline"
                className="border-white/[0.06] hover:bg-white/[0.03] text-white"
              >
                Try Again
              </Button>
            </div>
          )}

          {step === "preview" && noteData && (
            <div className="max-w-2xl mx-auto">
              {/* Clean minimal note view */}
              <article className="py-8">
                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-4 leading-tight">
                  {noteData.title}
                </h1>
                
                {/* Tags - subtle */}
                {noteData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-8">
                    {noteData.tags.map(tag => (
                      <span key={tag} className="text-xs text-white/40">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div className="h-px bg-white/10 mb-8" />

                {/* Content - clean typography */}
                <div className="prose prose-invert max-w-none
                  prose-headings:font-semibold prose-headings:text-white
                  prose-h1:text-xl prose-h1:mt-8 prose-h1:mb-4
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                  prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
                  prose-p:text-white/70 prose-p:leading-7 prose-p:mb-4
                  prose-a:text-white prose-a:underline prose-a:underline-offset-2 prose-a:decoration-white/30 hover:prose-a:decoration-white/60
                  prose-strong:text-white prose-strong:font-medium
                  prose-code:text-white/80 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-lg
                  prose-blockquote:border-l-2 prose-blockquote:border-white/20 prose-blockquote:pl-4 prose-blockquote:text-white/60 prose-blockquote:not-italic prose-blockquote:font-normal
                  prose-ul:text-white/70 prose-ol:text-white/70
                  prose-li:my-1
                  prose-hr:border-white/10 prose-hr:my-8
                  prose-img:rounded-lg">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {noteData.content}
                  </ReactMarkdown>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/10 mt-8 mb-6" />

                {/* Minimal footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-white/30">
                    <Lock className="h-3 w-3" />
                    <span>Encrypted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyNoteContent}
                      className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          )}

          {step === "preview" && fileData && (
            <div className="space-y-4">
              {/* File info */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    {(() => {
                      const Icon = getFileIcon(fileData.type);
                      return <Icon className="h-6 w-6 text-white/40" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-white mb-1 truncate">{fileData.name}</h2>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <span>{formatBytes(fileData.size)}</span>
                      <span>•</span>
                      <span className="uppercase">{fileData.type.split('/')[0]}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              {fileData.textContent ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono text-white/70 whitespace-pre-wrap">
                    {fileData.textContent}
                  </pre>
                </div>
              ) : fileData.url && fileData.type.startsWith('image/') ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <img
                    src={fileData.url}
                    alt={fileData.name}
                    className="w-full max-h-96 object-contain rounded-lg"
                  />
                </div>
              ) : fileData.url && fileData.type.startsWith('video/') ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <video
                    src={fileData.url}
                    controls
                    className="w-full max-h-96 rounded-lg"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              ) : !fileData.url && (fileData.type.startsWith('image/') || fileData.type.startsWith('video/')) ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-12">
                  <div className="text-center space-y-4">
                    <Eye className="h-12 w-12 text-white/20 mx-auto" />
                    <p className="text-sm text-white/40">Preview not loaded yet</p>
                    <Button
                      onClick={handleLoadPreview}
                      disabled={loadingPreview}
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                    >
                      {loadingPreview ? (
                        <>
                          <Loader className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Load Preview
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-12">
                  <div className="text-center">
                    <Eye className="h-12 w-12 text-white/20 mx-auto mb-3" />
                    <p className="text-sm text-white/40">Preview not available</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handleDownload}
                  className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 h-11 shadow-lg shadow-sky-500/25"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={() => setStep("password")}
                  variant="ghost"
                  className="h-11 px-6 text-white/40 hover:text-white hover:bg-white/[0.03]"
                >
                  <Lock className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]"><Loader className="h-8 w-8 text-white/50 animate-spin" /></div>}>
      <SharePageContent />
    </Suspense>
  );
}