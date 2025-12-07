"use client";

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  X, 
  FileIcon, 
  AlertCircle, 
  CheckCircle, 
  Loader,
  Shield
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { 
  generateEncryptionKeyAndNonce, 
  serializeEncryptionKey, 
  encryptFile,
  generateFileId,
  EncryptedFileInfo,
  handleFileError
} from "@/lib/e2ee";
import { uploadToStorage } from "@/lib/storage-client";
import { addFileToManifest } from "@/lib/manifest";
import { getStorageConfig, isStorageConfigured } from "@/lib/settings";

export interface FileUploadHandle {
  addFiles: (files: File[]) => void;
}

interface FileUploadProps {
  onFileUploaded?: (file: EncryptedFileInfo) => void;
  onUploadComplete?: () => void;
  maxFileSize?: number; // in MB
  maxFiles?: number;
  currentFolderId?: string; // Upload to this folder
}

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(
  function FileUpload({
    onFileUploaded,
    onUploadComplete,
    maxFileSize = 2048,
    maxFiles = 10,
    currentFolderId,
  }, ref) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Expose addFiles method via ref for external drag&drop
  const addFiles = useCallback((files: File[]) => {
    setError(null);
    const validFiles: File[] = [];

    for (const file of files) {
      if (validFiles.length + selectedFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} file(s) allowed`);
        break;
      }

      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxFileSize) {
        setError(`File ${file.name} exceeds ${maxFileSize}MB limit`);
        continue;
      }

      validFiles.push(file);
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
  }, [selectedFiles, maxFileSize, maxFiles]);

  useImperativeHandle(ref, () => ({
    addFiles,
  }), [addFiles]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const files = Array.from(e.target.files || []);
      const validFiles: File[] = [];

      for (const file of files) {
        if (validFiles.length + selectedFiles.length >= maxFiles) {
          setError(`Maximum ${maxFiles} file(s) allowed`);
          break;
        }

        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > maxFileSize) {
          setError(`File ${file.name} exceeds ${maxFileSize}MB limit`);
          continue;
        }

        validFiles.push(file);
      }

      setSelectedFiles([...selectedFiles, ...validFiles]);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedFiles, maxFileSize, maxFiles]
  );

  const handleRemoveSelected = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    if (!isStorageConfigured()) {
      setError("Please configure your storage settings first");
      return;
    }

    const config = getStorageConfig();
    if (!config) {
      setError("Storage not configured");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadStatus("");
    setUploadedCount(0);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileId = generateFileId();

        // Step 1: Generate encryption keys
        setUploadStatus(`Encrypting ${file.name}...`);
        const { key, nonce } = generateEncryptionKeyAndNonce();
        const { keyBase64, nonceBase64 } = serializeEncryptionKey({ key, nonce });

        // Step 2: Encrypt file
        const encryptedData = await encryptFile(file, key, nonce);

        // Step 3: Upload to storage
        setUploadStatus(`Uploading ${file.name}...`);
        await uploadToStorage(
          config,
          `files/${fileId}`,
          encryptedData,
          "application/octet-stream",
          (progress) => {
            const overallProgress = Math.round(
              ((i + progress / 100) / selectedFiles.length) * 100
            );
            setUploadProgress(overallProgress);
          }
        );

        // Step 4: Save file info to manifest
        const fileInfo: EncryptedFileInfo = {
          fileId,
          fileName: file.name,
          originalSize: file.size,
          encryptedSize: encryptedData.length,
          keyBase64,
          nonceBase64,
          mimeType: file.type || "application/octet-stream",
          uploadedAt: new Date().toISOString(),
          folderId: currentFolderId,
        };

        await addFileToManifest(config, fileInfo);
        setUploadedCount(prev => prev + 1);

        if (onFileUploaded) {
          onFileUploaded(fileInfo);
        }
      }

      setUploadProgress(100);
      setUploadStatus("Upload complete!");
      setSelectedFiles([]);

      if (onUploadComplete) {
        onUploadComplete();
      }

    } catch (err) {
      console.error("Upload error:", err);
      setError(handleFileError(err));
    } finally {
      setUploading(false);
    }
  }, [selectedFiles, onFileUploaded, onUploadComplete]);

  const handleClearAll = useCallback(() => {
    setSelectedFiles([]);
    setError(null);
  }, []);

  return (
    <div className="space-y-4 w-full">
      {/* Security notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/30 border border-blue-600/20 text-blue-300 text-xs">
        <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          Files are encrypted locally with AES-256-GCM before upload.
          Encryption keys are stored only on your device.
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload zone */}
      {!uploading && (
        <div 
          className="transition-all duration-200"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
            accept="*/*"
            multiple={maxFiles > 1}
          />

          <label
            htmlFor="file-upload"
            className={`block border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
              isDragOver 
                ? "border-sky-500 bg-sky-950/30 scale-[1.02]" 
                : "border-slate-600/50 hover:border-blue-500/70 hover:bg-blue-950/20"
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <Upload className={`h-10 w-10 transition-colors ${isDragOver ? "text-sky-400" : "text-slate-400"}`} />
              <div className="text-sm">
                {isDragOver ? (
                  <span className="text-sky-400 font-medium">Drop files here</span>
                ) : (
                  <>
                    <span className="text-blue-400 font-medium">Click to upload</span>
                    <span className="text-slate-400"> or drag and drop</span>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Max {maxFileSize}MB per file {maxFiles > 1 && `• Up to ${maxFiles} files`}
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Selected files */}
      {selectedFiles.length > 0 && !uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">
              {selectedFiles.length} file(s) selected
            </span>
            <button
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear all
            </button>
          </div>

          {selectedFiles.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg bg-[#161616] border border-[#252525]"
            >
              <FileIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-300 truncate">{file.name}</div>
                <div className="text-xs text-slate-500">{formatBytes(file.size)}</div>
              </div>
              <button
                onClick={() => handleRemoveSelected(idx)}
                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button
            onClick={handleUpload}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Encrypt & Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="p-4 rounded-lg bg-[#161616] border border-[#252525]">
          <div className="flex items-center gap-3 mb-3">
            <Loader className="h-5 w-5 text-blue-400 animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-slate-300">{uploadStatus}</div>
              <div className="text-xs text-slate-500">
                {uploadedCount} of {selectedFiles.length} files • {uploadProgress}%
              </div>
            </div>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      {/* Success state */}
      {!uploading && uploadedCount > 0 && selectedFiles.length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-950/30 border border-green-600/30">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <span className="text-green-300 text-sm">
            {uploadedCount} file{uploadedCount !== 1 ? 's' : ''} uploaded successfully
          </span>
        </div>
      )}
    </div>
  );
});
