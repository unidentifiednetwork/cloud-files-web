"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Trash2,
  Search,
  Eye,
  Copy,
  Check,
  AlertCircle,
  Loader,
  RefreshCw,
  CheckSquare,
  Square,
  X,
  Heart,
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  Grid3X3,
  List,
  Star,
  Image,
  FileText,
  FileVideo,
  FileAudio,
  File,
  Pencil,
  ArrowLeft,
  FolderOpen,
  Clipboard,
  Scissors,
  ClipboardPaste,
  Settings2,
  Share2,
  StickyNote,
  Plus,
  Pin,
  PinOff,
  Save,
  Tag,
  Clock,
  Calendar
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { format } from "date-fns";
import {
  EncryptedFileInfo,
  decryptFile,
  deriveShareKey,
  encryptJson,
  encryptBytes,
  bytesToBase64,
  base64ToBytes,
  generateSharePassword
} from "@/lib/e2ee";
import { downloadFromStorage, deleteFromStorage, getDownloadPresignedUrl } from "@/lib/storage-client";
import {
  getFileFromManifest,
  removeFileFromManifest,
  removeFilesFromManifest,
  toggleFileFavorite,
  getFavoriteFiles,
  getFolders,
  getFoldersInFolder,
  getFilesInFolder,
  createFolder,
  moveFilesToFolder,
  copyFilesToFolder,
  deleteFolder,
  renameFolder,
  renameFile,
  syncManifest,
  Folder as FolderType,
  getMasterKey
} from "@/lib/manifest";
import { getStorageConfig, isStorageConfigured } from "@/lib/settings";
import { dragTypesInclude, INTERNAL_DRAG_TYPE } from "@/lib/drag";
import {
  initializeNotes,
  isNotesInitialized,
  getNotesMetadata,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  toggleNotePin,
  searchNotes,
  getAllTags,
  NoteMetadata,
  Note,
  createNoteShare,
  generateNoteSharePassword,
  syncNotes
} from "@/lib/notes";
import { isCalendarInitialized, syncCalendar } from "@/lib/calendar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { CalendarView } from "@/components/CalendarView";

interface FileManagerProps {
  refreshTrigger?: number;
  onFolderChange?: (folderId: string | undefined) => void;
}

type ViewMode = "grid" | "list";
type Section = "all" | "favorites" | "folder" | "notes" | "calendar";

// Get file icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.startsWith("text/") || mimeType.includes("document") || mimeType.includes("pdf")) return FileText;
  return File;
}

// Get file icon color based on mime type - soft vibrant colors
function getFileIconColor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "text-rose-400";
  if (mimeType.startsWith("video/")) return "text-violet-400";
  if (mimeType.startsWith("audio/")) return "text-emerald-400";
  if (mimeType.includes("pdf")) return "text-orange-400";
  if (mimeType.startsWith("text/") || mimeType.includes("document")) return "text-sky-400";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return "text-amber-400";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "text-green-400";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "text-orange-400";
  return "text-slate-400";
}

// Get folder icon color
function getFolderColor(isDragOver: boolean) {
  return isDragOver ? "text-amber-400" : "text-amber-500/70";
}

export function FileManager({ refreshTrigger, onFolderChange }: FileManagerProps) {
  const [files, setFiles] = useState<EncryptedFileInfo[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string; textContent?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [section, setSection] = useState<Section>("all");
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<FolderType[]>([]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<"file" | "folder" | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [clipboardFileIds, setClipboardFileIds] = useState<string[]>([]);
  const [clipboardSourceFolder, setClipboardSourceFolder] = useState<string | undefined>(undefined);
  const [isCutOperation, setIsCutOperation] = useState(false);
  const [copyProgress, setCopyProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("autoRefreshEnabled") === "true";
  });
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    if (typeof window === "undefined") return 30;
    return parseInt(localStorage.getItem("autoRefreshInterval") || "30", 10);
  });
  const [showRefreshSettings, setShowRefreshSettings] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [shareGeneratedPassword, setShareGeneratedPassword] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [generatingShare, setGeneratingShare] = useState(false);
  
  // Notes state
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteColor, setNoteColor] = useState("default");
  const [showDeleteNoteConfirm, setShowDeleteNoteConfirm] = useState<string | null>(null);
  const [showNoteShareModal, setShowNoteShareModal] = useState(false);
  const [noteSharePassword, setNoteSharePassword] = useState('');
  const [noteShareGeneratedPassword, setNoteShareGeneratedPassword] = useState('');
  const [noteShareUrl, setNoteShareUrl] = useState('');
  const [generatingNoteShare, setGeneratingNoteShare] = useState(false);
  
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadFiles = useCallback(() => {
    setError(null);
    try {
      if (section === "favorites") {
        setLoading(true);
        setFiles(getFavoriteFiles());
        setFolders([]);
        setLoading(false);
      } else if (section === "notes") {
        // Notes section - will be loaded in separate useEffect
        setLoading(false);
        setFiles([]);
        setFolders([]);
      } else if (section === "folder" || section === "all") {
        setLoading(true);
        setFiles(getFilesInFolder(currentFolderId));
        setFolders(getFoldersInFolder(currentFolderId));
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to load files:", err);
      setError("Failed to load files");
      setLoading(false);
    }
  }, [section, currentFolderId]);

  // Load notes
  const loadNotes = useCallback(async () => {
    const config = getStorageConfig();
    const masterKey = getMasterKey();
    
    if (!config || !masterKey) return;

    try {
      if (!isNotesInitialized()) {
        await initializeNotes(config, masterKey);
      }
      setNotesInitialized(true);
      
      const metadata = getNotesMetadata();
      // Sort: pinned first, then by updatedAt
      const sorted = [...metadata].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      setNotes(sorted);
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  }, []);

  // Notes handlers
  const openNote = useCallback(async (noteId: string) => {
    const config = getStorageConfig();
    if (!config) return;

    setLoading(true);
    try {
      const note = await getNote(config, noteId);
      if (note) {
        setSelectedNote(note);
        setNoteTitle(note.title);
        setNoteContent(note.content);
        setNoteTags(note.tags.join(", "));
        setNoteColor(note.color || "default");
        setIsEditingNote(false);
      }
    } catch (err) {
      setError("Failed to load note");
    } finally {
      setLoading(false);
    }
  }, []);

  const startCreateNote = useCallback(() => {
    setIsCreatingNote(true);
    setSelectedNote(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteTags("");
    setNoteColor("default");
    setIsEditingNote(true);
  }, []);

  const handleSaveNote = useCallback(async () => {
    const config = getStorageConfig();
    if (!config || !noteTitle.trim()) return;

    setNoteSaving(true);
    try {
      const tags = noteTags.split(",").map(t => t.trim()).filter(Boolean);
      
      if (isCreatingNote) {
        const metadata = await createNote(
          config,
          noteTitle.trim(),
          noteContent,
          tags,
          noteColor !== "default" ? noteColor : undefined
        );
        const note = await getNote(config, metadata.id);
        if (note) {
          setSelectedNote(note);
          setIsCreatingNote(false);
          setIsEditingNote(false);
        }
      } else if (selectedNote) {
        await updateNote(config, selectedNote.id, {
          title: noteTitle.trim(),
          content: noteContent,
          tags,
          color: noteColor !== "default" ? noteColor : undefined,
        });
        const updated = await getNote(config, selectedNote.id);
        if (updated) {
          setSelectedNote(updated);
          setIsEditingNote(false);
        }
      }
      loadNotes();
    } catch (err) {
      setError("Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }, [noteTitle, noteContent, noteTags, noteColor, isCreatingNote, selectedNote, loadNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const config = getStorageConfig();
    if (!config) return;

    setNoteSaving(true);
    try {
      await deleteNote(config, noteId);
      loadNotes();
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
      }
      setShowDeleteNoteConfirm(null);
    } catch (err) {
      setError("Failed to delete note");
    } finally {
      setNoteSaving(false);
    }
  }, [selectedNote, loadNotes]);

  const handleToggleNotePin = useCallback(async (noteId: string) => {
    const config = getStorageConfig();
    if (!config) return;

    try {
      await toggleNotePin(config, noteId);
      loadNotes();
      if (selectedNote?.id === noteId) {
        setSelectedNote(prev => prev ? { ...prev, isPinned: !prev.isPinned } : null);
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  }, [selectedNote, loadNotes]);

  const closeNote = useCallback(() => {
    setSelectedNote(null);
    setIsCreatingNote(false);
    setIsEditingNote(false);
  }, []);

  const handleShareNote = useCallback(async () => {
    const config = getStorageConfig();
    if (!config || !selectedNote) return;

    setGeneratingNoteShare(true);
    setNoteShareUrl('');
    
    try {
      const password = noteSharePassword || generateNoteSharePassword();
      const result = await createNoteShare(config, selectedNote.id, password);
      
      setNoteShareGeneratedPassword(result.password);
      setNoteShareUrl(result.url);
    } catch (err) {
      setError("Failed to create share link");
    } finally {
      setGeneratingNoteShare(false);
    }
  }, [selectedNote, noteSharePassword]);

  const openNoteShareModal = useCallback(() => {
    setShowNoteShareModal(true);
    setNoteSharePassword('');
    setNoteShareGeneratedPassword('');
    setNoteShareUrl('');
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshTrigger]);

  // Load notes when switching to notes section
  useEffect(() => {
    if (section === "notes" && !notesInitialized) {
      loadNotes();
    }
  }, [section, notesInitialized, loadNotes]);

  // Sync manifest from server and reload files
  const syncAndReload = useCallback(async () => {
    const config = getStorageConfig();
    if (!config) return;

    try {
      await syncManifest(config);
      loadFiles();
      
      // Also sync notes if initialized
      if (isNotesInitialized()) {
        await syncNotes(config);
        loadNotes();
      }
      
      // Also sync calendar if initialized
      if (isCalendarInitialized()) {
        await syncCalendar(config);
      }
    } catch (error) {
      console.error("Auto-refresh failed:", error);
    }
  }, [loadFiles, loadNotes]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (autoRefreshEnabled && autoRefreshInterval > 0) {
      autoRefreshTimerRef.current = setInterval(() => {
        syncAndReload();
      }, autoRefreshInterval * 1000);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, syncAndReload]);

  // Save auto-refresh settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("autoRefreshEnabled", String(autoRefreshEnabled));
      localStorage.setItem("autoRefreshInterval", String(autoRefreshInterval));
    }
  }, [autoRefreshEnabled, autoRefreshInterval]);

  useEffect(() => {
    if (showNewFolderInput && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderInput]);

  const filteredFiles = files.filter(file =>
    file.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navigateToFolder = useCallback((folder: FolderType | null) => {
    if (folder === null) {
      setCurrentFolderId(undefined);
      setFolderPath([]);
      setSection("all");
      onFolderChange?.(undefined);
    } else {
      setCurrentFolderId(folder.id);
      setFolderPath(prev => [...prev, folder]);
      setSection("folder");
      onFolderChange?.(folder.id);
    }
    setSelectedIds(new Set());
  }, [onFolderChange]);

  const navigateUp = useCallback(() => {
    if (folderPath.length > 1) {
      const newPath = folderPath.slice(0, -1);
      setFolderPath(newPath);
      const newFolderId = newPath[newPath.length - 1].id;
      setCurrentFolderId(newFolderId);
      onFolderChange?.(newFolderId);
    } else {
      setFolderPath([]);
      setCurrentFolderId(undefined);
      setSection("all");
      onFolderChange?.(undefined);
    }
    setSelectedIds(new Set());
  }, [folderPath, onFolderChange]);

  const navigateToPathIndex = useCallback((index: number) => {
    if (index === -1) {
      setFolderPath([]);
      setCurrentFolderId(undefined);
      setSection("all");
      onFolderChange?.(undefined);
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      const newFolderId = newPath[newPath.length - 1].id;
      setCurrentFolderId(newFolderId);
      onFolderChange?.(newFolderId);
    }
    setSelectedIds(new Set());
  }, [folderPath, onFolderChange]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setShowNewFolderInput(false);
      return;
    }

    const config = getStorageConfig();
    if (!config) return;

    try {
      await createFolder(config, newFolderName.trim(), currentFolderId);
      setNewFolderName("");
      setShowNewFolderInput(false);
      loadFiles();
    } catch (err) {
      console.error("Failed to create folder:", err);
      setError("Failed to create folder");
    }
  }, [newFolderName, currentFolderId, loadFiles]);

  const handleToggleFavorite = useCallback(async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const config = getStorageConfig();
    if (!config) return;

    try {
      await toggleFileFavorite(config, fileId);
      loadFiles();
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  }, [loadFiles]);

  const handleDownload = useCallback(async (fileId: string) => {
    if (!isStorageConfigured()) {
      setError("Storage not configured");
      return;
    }

    const config = getStorageConfig();
    if (!config) {
      setError("Storage not configured");
      return;
    }

    const fileInfo = getFileFromManifest(fileId);
    if (!fileInfo) {
      setError("File not found");
      return;
    }

    setDownloadingId(fileId);
    setDownloadProgress(0);
    setError(null);

    try {
      const encryptedData = await downloadFromStorage(
        config,
        `files/${fileId}`,
        (progress) => setDownloadProgress(progress * 0.5)
      );

      setDownloadProgress(60);

      const decryptedData = await decryptFile(
        encryptedData,
        fileInfo.keyBase64,
        fileInfo.nonceBase64
      );

      setDownloadProgress(90);

      const blob = new Blob([decryptedData], { type: fileInfo.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileInfo.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadProgress(100);
    } catch (err) {
      console.error("Download error:", err);
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgress(0);
      }, 1000);
    }
  }, []);

  const handlePreview = useCallback(async (fileId: string) => {
    if (!isStorageConfigured()) {
      setError("Storage not configured");
      return;
    }

    const config = getStorageConfig();
    if (!config) return;

    const fileInfo = getFileFromManifest(fileId);
    if (!fileInfo) return;

    const isPreviewable =
      fileInfo.mimeType.startsWith("image/") ||
      fileInfo.mimeType.startsWith("text/") ||
      fileInfo.mimeType === "application/pdf";

    if (!isPreviewable) {
      handleDownload(fileId);
      return;
    }

    setDownloadingId(fileId);
    setError(null);

    try {
      const encryptedData = await downloadFromStorage(config, `files/${fileId}`);
      const decryptedData = await decryptFile(
        encryptedData,
        fileInfo.keyBase64,
        fileInfo.nonceBase64
      );

      const blob = new Blob([decryptedData], { type: fileInfo.mimeType });
      const url = URL.createObjectURL(blob);

      // For text files, read the content as text
      let textContent: string | undefined;
      if (fileInfo.mimeType.startsWith("text/")) {
        textContent = new TextDecoder().decode(decryptedData);
      }

      setPreviewFile({
        url,
        name: fileInfo.fileName,
        type: fileInfo.mimeType,
        textContent,
      });
    } catch (err) {
      console.error("Preview error:", err);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setDownloadingId(null);
    }
  }, [handleDownload]);

  const handleDelete = useCallback(async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) {
      return;
    }

    setDeletingId(fileId);
    setError(null);

    try {
      const config = getStorageConfig();

      if (config) {
        try {
          await deleteFromStorage(config, `files/${fileId}`);
        } catch (err) {
          console.warn("Failed to delete from storage:", err);
        }
        await removeFileFromManifest(config, fileId);
      }

      loadFiles();
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, [loadFiles]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    if (!confirm("Delete this folder? Files inside will be moved to root.")) {
      return;
    }

    const config = getStorageConfig();
    if (!config) return;

    try {
      await deleteFolder(config, folderId, false);
      loadFiles();
    } catch (err) {
      console.error("Delete folder error:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [loadFiles]);

  const toggleSelect = useCallback((fileId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    if (!confirm(`Delete ${count} file${count !== 1 ? 's' : ''}?`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    const config = getStorageConfig();
    const idsToDelete = Array.from(selectedIds);

    try {
      if (config) {
        for (const fileId of idsToDelete) {
          try {
            await deleteFromStorage(config, `files/${fileId}`);
          } catch (err) {
            console.warn(`Failed to delete ${fileId} from storage:`, err);
          }
        }
        await removeFilesFromManifest(config, idsToDelete);
      }

      loadFiles();
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Batch delete error:", err);
      setError("Some deletions failed");
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, loadFiles]);

  const handleMoveToFolder = useCallback(async (targetFolderId: string | undefined) => {
    if (selectedIds.size === 0) return;

    const config = getStorageConfig();
    if (!config) return;

    try {
      await moveFilesToFolder(config, Array.from(selectedIds), targetFolderId);
      setSelectedIds(new Set());
      loadFiles();
    } catch (err) {
      console.error("Move error:", err);
      setError("Failed to move files");
    }
  }, [selectedIds, loadFiles]);

  // Handle paste files (copy or move files from clipboard to current folder)
  const handlePasteFiles = useCallback(async () => {
    if (clipboardFileIds.length === 0) return;

    // Don't paste to the same folder for cut operations
    if (isCutOperation && clipboardSourceFolder === currentFolderId) {
      setError("Files are already in this folder");
      return;
    }

    // Prevent double-paste while copying
    if (copyProgress !== null) return;

    const config = getStorageConfig();
    if (!config) return;

    try {
      if (isCutOperation) {
        // Move files
        await moveFilesToFolder(config, clipboardFileIds, currentFolderId);
        // Clear clipboard after cut+paste
        setClipboardFileIds([]);
        setClipboardSourceFolder(undefined);
        setIsCutOperation(false);
      } else {
        // Copy files (create duplicates)
        setCopyProgress({ current: 0, total: clipboardFileIds.length });
        await copyFilesToFolder(config, clipboardFileIds, currentFolderId, (current, total) => {
          setCopyProgress({ current, total });
        });
        setCopyProgress(null);
        // Don't clear clipboard after copy - user can paste again
      }

      setSelectedIds(new Set());
      loadFiles();
    } catch (err) {
      console.error("Paste error:", err);
      setCopyProgress(null);
      setError(isCutOperation ? "Failed to move files" : "Failed to copy files");
    }
  }, [clipboardFileIds, clipboardSourceFolder, currentFolderId, isCutOperation, copyProgress, loadFiles]);

  // Drag and drop handlers for files
  const handleFileDragStart = useCallback((e: React.DragEvent, fileId: string) => {
    e.stopPropagation();

    const idsToMove = selectedIds.has(fileId) && selectedIds.size > 0
      ? Array.from(selectedIds)
      : [fileId];

    if (!selectedIds.has(fileId)) {
      setSelectedIds(new Set([fileId]));
    }

    // Set data with plain text fallback for better compatibility
    e.dataTransfer.setData("text/plain", JSON.stringify(idsToMove));
    e.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(idsToMove));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";

    // Create a custom drag image
    const dragEl = document.createElement('div');
    dragEl.className = 'fixed -left-[9999px] px-3 py-2 bg-white/10 backdrop-blur rounded-lg border border-white/20 text-white text-sm';
    dragEl.textContent = idsToMove.length > 1 ? `${idsToMove.length} files` : 'Moving file...';
    document.body.appendChild(dragEl);
    e.dataTransfer.setDragImage(dragEl, 0, 0);
    setTimeout(() => document.body.removeChild(dragEl), 0);
  }, [selectedIds]);

  const handleFileDragEnd = useCallback(() => {
    setDragOverFolderId(null);
    setDragOverBreadcrumb(null);
  }, []);

  // Rename handlers
  const startRename = useCallback((id: string, type: "file" | "folder", currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenamingType(type);
    setRenameValue(currentName);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingId || !renamingType || !renameValue.trim()) {
      setRenamingId(null);
      setRenamingType(null);
      return;
    }

    const config = getStorageConfig();
    if (!config) {
      setError("Storage not configured");
      return;
    }

    try {
      if (renamingType === "file") {
        await renameFile(config, renamingId, renameValue.trim());
      } else {
        await renameFolder(config, renamingId, renameValue.trim());
      }
      loadFiles();
    } catch (err) {
      console.error("Failed to rename:", err);
      setError(`Failed to rename ${renamingType}`);
    } finally {
      setRenamingId(null);
      setRenamingType(null);
    }
  }, [renamingId, renamingType, renameValue, loadFiles]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setRenamingId(null);
      setRenamingType(null);
    }
  }, [handleRename]);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Accept both our custom type and text/plain (fallback)
    const hasInternalType = dragTypesInclude(e.dataTransfer, INTERNAL_DRAG_TYPE);
    const hasTextPlain = dragTypesInclude(e.dataTransfer, "text/plain");

    if (hasInternalType || hasTextPlain) {
      e.dataTransfer.dropEffect = "move";
      setDragOverFolderId(folderId);
    }
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're leaving to an element outside the current drop target
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragOverFolderId(null);
      setDragOverBreadcrumb(null);
    }
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, folderId: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    setDragOverBreadcrumb(null);

    // Try to get data from our custom type first, then fallback to text/plain
    let data = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
    if (!data) {
      data = e.dataTransfer.getData("text/plain");
    }
    if (!data) return;

    let fileIds: string[];
    try {
      fileIds = JSON.parse(data) as string[];
    } catch {
      return;
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) return;

    const config = getStorageConfig();
    if (!config) return;

    try {
      await moveFilesToFolder(config, fileIds, folderId);
      setSelectedIds(new Set());
      loadFiles();
    } catch (err) {
      console.error("Move error:", err);
      setError("Failed to move files");
    }
  }, [loadFiles]);

  const handleBreadcrumbDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Accept both our custom type and text/plain (fallback)
    const hasInternalType = dragTypesInclude(e.dataTransfer, INTERNAL_DRAG_TYPE);
    const hasTextPlain = dragTypesInclude(e.dataTransfer, "text/plain");

    if (hasInternalType || hasTextPlain) {
      e.dataTransfer.dropEffect = "move";
      setDragOverBreadcrumb(id);
    }
  }, []);

  const closePreview = useCallback(() => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.url);
      setPreviewFile(null);
    }
  }, [previewFile]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl+A - Select all files
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const allFileIds = new Set(filteredFiles.map(f => f.fileId));
        setSelectedIds(allFileIds);
        return;
      }

      // Ctrl+C - Copy selected files
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault();
        setClipboardFileIds(Array.from(selectedIds));
        setClipboardSourceFolder(currentFolderId);
        setIsCutOperation(false);
        return;
      }

      // Ctrl+X - Cut selected files
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedIds.size > 0) {
        e.preventDefault();
        setClipboardFileIds(Array.from(selectedIds));
        setClipboardSourceFolder(currentFolderId);
        setIsCutOperation(true);
        return;
      }

      // Ctrl+V - Paste files
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardFileIds.length > 0) {
        e.preventDefault();
        handlePasteFiles();
        return;
      }

      // Delete - Delete selected files
      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Escape - Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIds(new Set());
        if (previewFile) {
          closePreview();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredFiles, selectedIds, clipboardFileIds, currentFolderId, previewFile, handlePasteFiles, handleDeleteSelected, closePreview]);

  const handleShare = useCallback(async (fileId: string) => {
    setShareFileId(fileId);
    setShareGeneratedPassword(generateSharePassword());
    setSharePassword('');
    setShareUrl('');
    setShowShareModal(true);
  }, []);

  const generateShare = useCallback(async () => {
    if (!shareFileId || (!sharePassword && !shareGeneratedPassword)) return;
    const pw = sharePassword || shareGeneratedPassword;
    setGeneratingShare(true);
    try {
      const config = getStorageConfig()!;
      const fileInfo = getFileFromManifest(shareFileId)!;
      const fileKeyBytes = base64ToBytes(fileInfo.keyBase64);
      const fileNonceBytes = base64ToBytes(fileInfo.nonceBase64);
      const presignedUrl = await getDownloadPresignedUrl(config, `files/${shareFileId}`, 60 * 60 * 24 * 7); // 7 days max
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const shareKey = await deriveShareKey(pw, salt);
      const encFileKey = await encryptBytes(fileKeyBytes, shareKey);
      const encFileNonce = await encryptBytes(fileNonceBytes, shareKey);
      const innerBundle = {
        v: 1,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        presignedUrl,
        encFileKeyBase64: bytesToBase64(encFileKey),
        encFileNonceBase64: bytesToBase64(encFileNonce)
      };
      const encInner = await encryptJson(innerBundle, shareKey);
      const saltB64 = bytesToBase64(salt);
      const encInnerB64 = bytesToBase64(encInner);
      const bundleB64 = `${saltB64}.${encInnerB64}`;
      const url = `${window.location.origin}/share?s=${encodeURIComponent(bundleB64)}`;
      setShareUrl(url);
    } catch (err) {
      console.error('Share generation failed:', err);
      setError('Failed to generate share link');
    } finally {
      setGeneratingShare(false);
    }
  }, [shareFileId, sharePassword, shareGeneratedPassword]);

  const filteredFilesForShare = files.filter(file =>
    file.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFoldersForShare = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="h-6 w-6 text-white/50 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Breadcrumb / Navigation */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            onClick={() => navigateToPathIndex(-1)}
            onDragOver={(e) => handleBreadcrumbDragOver(e, "root")}
            onDragLeave={handleFolderDragLeave}
            onDrop={(e) => handleFolderDrop(e, undefined)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${dragOverBreadcrumb === "root"
              ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
              : section === "all" && !currentFolderId
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Files</span>
          </button>

          <button
            onClick={() => { setSection("favorites"); setCurrentFolderId(undefined); setFolderPath([]); onFolderChange?.(undefined); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${section === "favorites"
              ? "bg-rose-500/20 text-rose-400"
              : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
          >
            <Heart className={`h-4 w-4 ${section === "favorites" ? "fill-current" : ""}`} />
            <span className="hidden sm:inline">Favorites</span>
          </button>

          <button
            onClick={() => { setSection("notes"); setCurrentFolderId(undefined); setFolderPath([]); onFolderChange?.(undefined); closeNote(); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${section === "notes"
              ? "bg-amber-500/20 text-amber-400"
              : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
          >
            <StickyNote className={`h-4 w-4 ${section === "notes" ? "fill-amber-400/20" : ""}`} />
            <span className="hidden sm:inline">Notes</span>
          </button>

          <button
            onClick={() => { setSection("calendar"); setCurrentFolderId(undefined); setFolderPath([]); onFolderChange?.(undefined); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${section === "calendar"
              ? "bg-sky-500/20 text-sky-400"
              : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
          >
            <Calendar className={`h-4 w-4 ${section === "calendar" ? "fill-sky-400/20" : ""}`} />
            <span className="hidden sm:inline">Calendar</span>
          </button>

          {section === "all" && folderPath.length > 0 && (
            <>
              <ChevronRight className="h-4 w-4 text-white/20 flex-shrink-0" />
              {folderPath.map((folder, index) => (
                <div key={folder.id} className="flex items-center gap-1.5">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-white/20 flex-shrink-0" />}
                  <button
                    onClick={() => navigateToPathIndex(index)}
                    onDragOver={(e) => handleBreadcrumbDragOver(e, folder.id)}
                    onDragLeave={handleFolderDragLeave}
                    onDrop={(e) => handleFolderDrop(e, folder.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-sm truncate max-w-[120px] transition-all ${dragOverBreadcrumb === folder.id
                      ? "bg-amber-500 text-white shadow-lg"
                      : index === folderPath.length - 1
                        ? "bg-white/10 text-white font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* View toggle & New folder */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="p-2.5 rounded-lg text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
            title="New folder"
          >
            <FolderPlus className="h-5 w-5" />
          </button>

          <div className="flex items-center bg-white/5 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-md transition-all ${viewMode === "grid" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white"
                }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-all ${viewMode === "list" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white"
                }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowRefreshSettings(!showRefreshSettings)}
              className={`p-2.5 rounded-lg transition-all flex items-center gap-1.5 ${autoRefreshEnabled
                ? "text-emerald-400 bg-emerald-400/10"
                : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              title={autoRefreshEnabled ? `Auto-refresh: ${autoRefreshInterval}s` : "Refresh settings"}
            >
              <RefreshCw className={`h-5 w-5 ${autoRefreshEnabled ? "animate-spin-slow" : ""}`} />
              {autoRefreshEnabled && (
                <span className="text-xs font-medium">{autoRefreshInterval}s</span>
              )}
            </button>

            {showRefreshSettings && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white">Auto-refresh</span>
                    <button
                      onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${autoRefreshEnabled ? "bg-emerald-500" : "bg-white/10"
                        }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoRefreshEnabled ? "translate-x-6" : "translate-x-1"
                        }`} />
                    </button>
                  </div>
                  {autoRefreshEnabled && (
                    <div className="space-y-2">
                      <label className="text-xs text-white/40">Refresh interval</label>
                      <div className="flex gap-2">
                        {[15, 30, 60, 120].map((seconds) => (
                          <button
                            key={seconds}
                            onClick={() => setAutoRefreshInterval(seconds)}
                            className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${autoRefreshInterval === seconds
                              ? "bg-emerald-500 text-white"
                              : "bg-white/5 text-white/60 hover:bg-white/10"
                              }`}
                          >
                            {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { syncAndReload(); setShowRefreshSettings(false); }}
                  className="w-full p-3 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          type="text"
          placeholder="Search files and folders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-11 bg-white/[0.03] border-white/10 text-white placeholder:text-white/30 h-11 rounded-xl focus:border-white/20 focus:ring-0"
        />
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Folder className="h-5 w-5 text-amber-400" />
          </div>
          <Input
            ref={newFolderInputRef}
            type="text"
            placeholder="Enter folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); }
            }}
            className="flex-1 bg-transparent border-0 text-white placeholder:text-white/40 h-9 focus-visible:ring-0 text-sm"
          />
          <button onClick={handleCreateFolder} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20">
            Create
          </button>
          <button
            onClick={() => { setShowNewFolderInput(false); setNewFolderName(""); }}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
                <span className="text-sm font-bold text-sky-400">{selectedIds.size}</span>
              </div>
              <span className="text-sm text-white/80">selected</span>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-white/50 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Copy button */}
            <button
              onClick={() => {
                setClipboardFileIds(Array.from(selectedIds));
                setClipboardSourceFolder(currentFolderId);
                setIsCutOperation(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/20 hover:text-white transition-all"
              title="Copy (Ctrl+C)"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copy</span>
            </button>
            {/* Cut button */}
            <button
              onClick={() => {
                setClipboardFileIds(Array.from(selectedIds));
                setClipboardSourceFolder(currentFolderId);
                setIsCutOperation(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/20 hover:text-white transition-all"
              title="Cut (Ctrl+X)"
            >
              <Scissors className="h-4 w-4" />
              <span className="hidden sm:inline">Cut</span>
            </button>
            {folders.length > 0 && (
              <select
                onChange={(e) => handleMoveToFolder(e.target.value || undefined)}
                className="bg-white/10 border border-white/10 rounded-lg text-sm text-white px-3 py-2"
                defaultValue=""
              >
                <option value="">Move to...</option>
                <option value="">Root</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-all disabled:opacity-50"
              title="Delete (Del)"
            >
              {isDeleting ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Clipboard indicator */}
      {clipboardFileIds.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/20">
              <Clipboard className="h-4 w-4 text-violet-400" />
            </div>
            <span className="text-sm text-white/80">
              {clipboardFileIds.length} file{clipboardFileIds.length !== 1 ? 's' : ''} {isCutOperation ? 'cut' : 'copied'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteFiles}
              disabled={clipboardSourceFolder === currentFolderId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 text-sm font-medium hover:bg-violet-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Paste (Ctrl+V)"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste here
            </button>
            <button
              onClick={() => {
                setClipboardFileIds([]);
                setClipboardSourceFolder(undefined);
                setIsCutOperation(false);
              }}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
              title="Clear clipboard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Copy Progress */}
      {copyProgress && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <div className="p-2 rounded-lg bg-sky-500/20">
            <Copy className="h-4 w-4 text-sky-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sky-400 text-sm font-medium">
                Copying files...
              </span>
              <span className="text-sky-400/70 text-xs">
                {copyProgress.current} / {copyProgress.total}
              </span>
            </div>
            <Progress
              value={(copyProgress.current / copyProgress.total) * 100}
              className="h-1.5 bg-sky-500/20"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="p-2 rounded-lg bg-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400" />
          </div>
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Current Path Bar - shown when inside folders */}
      {section === "all" && folderPath.length > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
          <Folder className="h-4 w-4 text-white/40 flex-shrink-0" />
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => navigateToPathIndex(-1)}
              onDragOver={(e) => handleBreadcrumbDragOver(e, "root")}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, undefined)}
              className={`text-xs px-2 py-1 rounded transition-all flex-shrink-0 ${dragOverBreadcrumb === "root"
                ? "bg-white text-black"
                : "text-white/50 hover:text-white hover:bg-white/10"
                }`}
            >
              Root
            </button>
            {folderPath.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="h-3 w-3 text-white/20" />
                <button
                  onClick={() => navigateToPathIndex(index)}
                  onDragOver={(e) => handleBreadcrumbDragOver(e, folder.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(e) => handleFolderDrop(e, folder.id)}
                  className={`text-xs px-2 py-1 rounded transition-all ${dragOverBreadcrumb === folder.id
                    ? "bg-white text-black"
                    : index === folderPath.length - 1
                      ? "text-white bg-white/10"
                      : "text-white/50 hover:text-white hover:bg-white/10"
                    }`}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
          <span className="text-xs text-white/30 flex-shrink-0">
            {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {section === "calendar" ? (
          /* Calendar Section */
          <CalendarView />
        ) : section === "notes" ? (
          /* Notes Section */
          <div className="h-full flex">
            {/* Notes List */}
            <div className={`${selectedNote || isCreatingNote ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-80 xl:w-96 border-r border-white/5`}>
              {/* Notes Header */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">Notes</h2>
                  <Button
                    size="sm"
                    onClick={startCreateNote}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    New Note
                  </Button>
                </div>
              </div>

              {/* Notes List */}
              <div className="flex-1 overflow-auto p-2 space-y-2">
                {notes.length === 0 ? (
                  <div className="text-center py-12">
                    <StickyNote className="h-12 w-12 text-amber-500/30 mx-auto mb-3" />
                    <p className="text-white/50 text-sm">No notes yet</p>
                    <p className="text-white/30 text-xs mt-1">Create your first note</p>
                  </div>
                ) : (
                  notes.map(note => (
                    <div
                      key={note.id}
                      onClick={() => openNote(note.id)}
                      className={`group p-3 rounded-xl cursor-pointer transition-all ${
                        selectedNote?.id === note.id
                          ? "bg-amber-500/20 border border-amber-500/30"
                          : "bg-white/[0.03] border border-transparent hover:bg-white/[0.05] hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-medium text-white truncate flex-1">{note.title}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {note.isPinned && <Pin className="h-3 w-3 text-amber-400" />}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleNotePin(note.id); }}
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              note.isPinned ? "text-amber-400 hover:bg-amber-500/20" : "text-white/40 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            {note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      {note.preview && <p className="text-xs text-white/40 line-clamp-2 mb-2">{note.preview}</p>}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                          {note.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/60 truncate">
                              {tag}
                            </span>
                          ))}
                          {note.tags.length > 2 && (
                            <span className="text-[10px] text-white/40">+{note.tags.length - 2}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/30 flex-shrink-0">
                          {format(new Date(note.updatedAt), "MMM d")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Note Content */}
            <div className={`${selectedNote || isCreatingNote ? "flex" : "hidden lg:flex"} flex-col flex-1 min-w-0`}>
              {selectedNote || isCreatingNote ? (
                <>
                  {/* Note Header */}
                  <div className="p-4 border-b border-white/5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={closeNote}
                        className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      {isEditingNote ? (
                        <Input
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          placeholder="Note title..."
                          className="flex-1 h-9 text-lg font-semibold bg-white/5 border-0 text-white"
                        />
                      ) : (
                        <h2 className="text-lg font-semibold text-white truncate">{selectedNote?.title}</h2>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isEditingNote ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (isCreatingNote) {
                                closeNote();
                              } else {
                                setIsEditingNote(false);
                                if (selectedNote) {
                                  setNoteTitle(selectedNote.title);
                                  setNoteContent(selectedNote.content);
                                  setNoteTags(selectedNote.tags.join(", "));
                                }
                              }
                            }}
                            className="text-white/60 hover:text-white"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveNote}
                            disabled={noteSaving || !noteTitle.trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-black gap-1.5"
                          >
                            {noteSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => selectedNote && handleToggleNotePin(selectedNote.id)}
                            className={selectedNote?.isPinned ? "text-amber-400" : "text-white/60 hover:text-white"}
                          >
                            {selectedNote?.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={openNoteShareModal}
                            className="text-white/60 hover:text-sky-400 gap-1.5"
                          >
                            <Share2 className="h-4 w-4" />
                            Share
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingNote(true)}
                            className="text-white/60 hover:text-white gap-1.5"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => selectedNote && setShowDeleteNoteConfirm(selectedNote.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Note Body */}
                  <div className="flex-1 overflow-auto">
                    {isEditingNote ? (
                      <div className="h-full flex flex-col">
                        {/* Tags input in edit mode */}
                        <div className="px-4 pt-3 flex items-center gap-2">
                          <Tag className="h-4 w-4 text-white/40" />
                          <Input
                            value={noteTags}
                            onChange={(e) => setNoteTags(e.target.value)}
                            placeholder="Tags (comma separated)..."
                            className="flex-1 h-8 text-sm bg-white/5 border-0 text-white placeholder:text-white/30"
                          />
                        </div>
                        <div className="flex-1 p-4 h-full overflow-hidden">
                          <MarkdownEditor
                            value={noteContent}
                            onChange={setNoteContent}
                            placeholder="Start writing..."
                            minHeight="100%"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-6">
                        {/* Tags display */}
                        {selectedNote && selectedNote.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {selectedNote.tags.map(tag => (
                              <span key={tag} className="px-2 py-1 rounded-lg text-xs bg-white/10 text-white/70 flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Markdown preview */}
                        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-white/80 prose-a:text-amber-400 prose-strong:text-white prose-code:text-amber-300 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedNote?.content || ""}
                          </ReactMarkdown>
                        </div>
                        {/* Note metadata */}
                        {selectedNote && (
                          <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-xs text-white/30">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Created {format(new Date(selectedNote.createdAt), "MMM d, yyyy")}
                            </span>
                            <span>•</span>
                            <span>Updated {format(new Date(selectedNote.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <StickyNote className="h-16 w-16 text-amber-500/20 mx-auto mb-4" />
                    <p className="text-white/40 text-sm">Select a note to view</p>
                    <p className="text-white/30 text-xs mt-1">or create a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
              {section === "favorites" ? (
                <Heart className="h-10 w-10 text-rose-500/40" />
              ) : (
                <FolderOpen className="h-10 w-10 text-amber-500/40" />
              )}
            </div>
            <p className="text-white/70 font-medium text-lg">
              {section === "favorites" ? "No favorites yet" : "This folder is empty"}
            </p>
            <p className="text-white/40 text-sm mt-2">
              {section === "favorites"
                ? "Heart files to add them here"
                : "Drop files here or create a new folder"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {/* Folders */}
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => renamingId !== folder.id && navigateToFolder(folder)}
                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
                className={`group relative p-4 rounded-xl bg-white/[0.03] border-2 transition-all cursor-pointer ${dragOverFolderId === folder.id
                  ? "border-amber-500/50 bg-amber-500/10 scale-[1.02] shadow-lg shadow-amber-500/10"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.05]"
                  }`}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`p-3 rounded-xl transition-all ${dragOverFolderId === folder.id ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                    <Folder className={`h-8 w-8 transition-colors ${getFolderColor(dragOverFolderId === folder.id)}`} />
                  </div>
                  {renamingId === folder.id && renamingType === "folder" ? (
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRename}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-sm text-center bg-black border-white/20 px-1"
                      autoFocus
                    />
                  ) : (
                    <span className="text-sm text-white/80 truncate w-full">{folder.name}</span>
                  )}
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(folder.id, "folder", folder.name, e)}
                    className="p-1 rounded bg-black/50 text-white/40 hover:text-white"
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                    className="p-1 rounded bg-black/50 text-white/40 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => {
              const IconComponent = getFileIcon(file.mimeType);
              const iconColor = getFileIconColor(file.mimeType);
              const isSelected = selectedIds.has(file.fileId);

              return (
                <div
                  key={file.fileId}
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file.fileId)}
                  onDragEnd={handleFileDragEnd}
                  onClick={() => handlePreview(file.fileId)}
                  className={`group relative p-4 rounded-xl bg-white/[0.03] border-2 transition-all cursor-pointer ${isSelected
                    ? "border-sky-500/40 bg-sky-500/10 shadow-lg shadow-sky-500/5"
                    : "border-transparent hover:border-white/10 hover:bg-white/[0.05]"
                    }`}
                >
                  {/* Selection checkbox */}
                  <button
                    onClick={(e) => toggleSelect(file.fileId, e)}
                    className={`absolute top-2 left-2 p-1.5 rounded-lg transition-all ${isSelected
                      ? "opacity-100 text-sky-400 bg-sky-500/20"
                      : "opacity-0 group-hover:opacity-100 text-white/40 hover:text-white bg-black/60 backdrop-blur-sm"
                      }`}
                  >
                    {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => handleToggleFavorite(file.fileId, e)}
                    className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all ${file.isFavorite
                      ? "opacity-100 text-rose-400 bg-rose-500/20"
                      : "opacity-0 group-hover:opacity-100 text-white/40 hover:text-white bg-black/60 backdrop-blur-sm"
                      }`}
                  >
                    <Heart className={`h-4 w-4 ${file.isFavorite ? "fill-current" : ""}`} />
                  </button>

                  <div className="flex flex-col items-center text-center pt-4 gap-2">
                    <div className="p-3 rounded-xl bg-white/5">
                      <IconComponent className={`h-8 w-8 ${iconColor}`} />
                    </div>
                    {renamingId === file.fileId && renamingType === "file" ? (
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 text-sm text-center bg-black border-white/20 px-1"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm text-white/90 font-medium truncate w-full">{file.fileName}</span>
                    )}
                    <span className="text-xs text-white/40">{formatBytes(file.originalSize)}</span>
                  </div>

                  {/* Download progress */}
                  {downloadingId === file.fileId && (
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <Progress value={downloadProgress} className="h-1" />
                    </div>
                  )}

                  {/* Actions on hover */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRename(file.fileId, "file", file.fileName, e)}
                      className="p-1.5 rounded bg-black/70 text-white/50 hover:text-white"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(file.fileId); }}
                      className="p-1.5 rounded bg-black/70 text-white/50 hover:text-white"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleShare(file.fileId); }}
                      className="p-1.5 rounded bg-black/70 text-white/50 hover:text-sky-400"
                      title="Share"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(file.fileId); }}
                      className="p-1.5 rounded bg-black/70 text-white/50 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-1.5">
            {/* Folders */}
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => renamingId !== folder.id && navigateToFolder(folder)}
                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
                className={`group flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${dragOverFolderId === folder.id
                  ? "bg-amber-500/10 border-2 border-amber-500/30 shadow-lg shadow-amber-500/5"
                  : "bg-white/[0.02] border-2 border-transparent hover:bg-white/[0.04] hover:border-white/5"
                  }`}
              >
                <div className={`p-2 rounded-lg transition-colors ${dragOverFolderId === folder.id ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                  <Folder className={`h-5 w-5 flex-shrink-0 transition-colors ${getFolderColor(dragOverFolderId === folder.id)}`} />
                </div>
                {renamingId === folder.id && renamingType === "folder" ? (
                  <Input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={handleRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 text-sm bg-black border-white/20 flex-1"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm text-white/80 flex-1 truncate">{folder.name}</span>
                )}
                <span className="text-xs text-white/30">Folder</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(folder.id, "folder", folder.name, e)}
                    className="p-1 rounded text-white/40 hover:text-white"
                    title="Rename"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                    className="p-1 rounded text-white/40 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => {
              const IconComponent = getFileIcon(file.mimeType);
              const iconColor = getFileIconColor(file.mimeType);
              const isSelected = selectedIds.has(file.fileId);

              return (
                <div
                  key={file.fileId}
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file.fileId)}
                  onDragEnd={handleFileDragEnd}
                  onClick={() => handlePreview(file.fileId)}
                  className={`group flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${isSelected
                    ? "bg-sky-500/10 border-2 border-sky-500/30 shadow-lg shadow-sky-500/5"
                    : "bg-white/[0.02] border-2 border-transparent hover:bg-white/[0.04] hover:border-white/5"
                    }`}
                >
                  <button
                    onClick={(e) => toggleSelect(file.fileId, e)}
                    className={`flex-shrink-0 transition-colors ${isSelected ? 'text-sky-400' : 'text-white/40 hover:text-white'}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>

                  <div className="p-2 rounded-lg bg-white/5 flex-shrink-0">
                    <IconComponent className={`h-5 w-5 ${iconColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {renamingId === file.fileId && renamingType === "file" ? (
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 text-sm bg-black border-white/20"
                        autoFocus
                      />
                    ) : (
                      <div className="text-sm text-white/90 font-medium truncate">{file.fileName}</div>
                    )}
                    <div className="text-xs text-white/40">
                      {formatBytes(file.originalSize)} • {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleToggleFavorite(file.fileId, e)}
                    className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${file.isFavorite
                      ? "text-rose-400 bg-rose-500/20"
                      : "text-white/30 opacity-0 group-hover:opacity-100 hover:text-rose-400"
                      }`}
                  >
                    <Heart className={`h-4 w-4 ${file.isFavorite ? "fill-current" : ""}`} />
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRename(file.fileId, "file", file.fileName, e)}
                      className="p-1.5 rounded text-white/40 hover:text-white"
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(file.fileId); }}
                      className="p-1.5 rounded text-white/40 hover:text-white"
                      title="Download"
                    >
                      {downloadingId === file.fileId ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleShare(file.fileId); }}
                      className="p-1.5 rounded text-white/40 hover:text-sky-400"
                      title="Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(file.fileId); }}
                      className="p-1.5 rounded text-white/40 hover:text-red-400"
                      disabled={deletingId === file.fileId}
                    >
                      {deletingId === file.fileId ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90"
          onClick={closePreview}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full">
            <button
              onClick={closePreview}
              className="absolute -top-12 right-0 flex items-center gap-2 text-white hover:text-slate-300"
            >
              <span className="text-sm">{previewFile.name}</span>
              <X className="h-5 w-5" />
            </button>
            {previewFile.type.startsWith("image/") ? (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="max-w-full max-h-[80vh] mx-auto rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : previewFile.type === "application/pdf" ? (
              <iframe
                src={previewFile.url}
                title={previewFile.name}
                className="w-full h-[80vh] rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : previewFile.type.startsWith("text/") ? (
              <div
                className="bg-[#0d0d0d] border border-white/10 p-6 rounded-xl max-w-4xl max-h-[80vh] overflow-auto mx-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                  {previewFile.textContent || "Unable to load file content"}
                </pre>
              </div>
            ) : (
              <div className="bg-[#161616] p-6 rounded-xl text-center" onClick={(e) => e.stopPropagation()}>
                <p className="text-white/70">Preview not available for this file type</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#0a0a0a] border border-white/[0.06] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                    <Share2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-white">Share File</h3>
                    <p className="text-xs text-white/40">End-to-end encrypted</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 mb-2 block">Password</label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={shareGeneratedPassword}
                      readOnly
                      className="flex-1 bg-white/[0.03] border-white/[0.06] text-white font-mono text-sm h-10"
                      placeholder="Generated password"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const newPw = generateSharePassword();
                        setShareGeneratedPassword(newPw);
                      }}
                      variant="ghost"
                      className="h-10 px-3 text-white/40 hover:text-white hover:bg-white/[0.03]"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-white/30 mt-1.5">Or use custom password:</p>
                  <Input
                    type="password"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="Custom password"
                    className="mt-1.5 bg-white/[0.03] border-white/[0.06] text-white h-10"
                  />
                </div>

                <Button
                  onClick={generateShare}
                  disabled={generatingShare || (!sharePassword && !shareGeneratedPassword)}
                  className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 h-11 shadow-lg shadow-sky-500/25 disabled:opacity-50"
                >
                  {generatingShare ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4 mr-2" />
                      {shareUrl ? 'Generate New Link' : 'Generate Link'}
                    </>
                  )}
                </Button>

                {shareUrl && (
                  <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-xs text-emerald-400 mb-1">Link generated successfully</p>
                      <p className="text-xs text-white/30">Expires in 7 days</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(`${shareUrl}\n\nPassword: ${sharePassword || shareGeneratedPassword}`);
                        }}
                        variant="outline"
                        className="flex-1 h-10 border-white/[0.06] hover:bg-white/[0.03] text-white text-sm"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link + Password
                      </Button>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(shareUrl);
                        }}
                        variant="ghost"
                        className="flex-1 h-10 text-white/40 hover:text-white hover:bg-white/[0.03] text-sm"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link Only
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation */}
      {showDeleteNoteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteNoteConfirm(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[#0c0c0c] border border-white/[0.06] rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">Delete Note</h3>
            <p className="text-white/60 text-sm mb-6">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteNoteConfirm(null)}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteNote(showDeleteNoteConfirm)}
                disabled={noteSaving}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {noteSaving ? <Loader className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share Note Modal */}
      {showNoteShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNoteShareModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[#0c0c0c] border border-white/[0.06] rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Share Note</h3>
              <button
                onClick={() => setShowNoteShareModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-white/60 text-sm mb-4">
              Share &quot;{selectedNote?.title}&quot; with others. They will need the password to view it.
            </p>

            {!noteShareUrl ? (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">Password (optional)</label>
                    <Input
                      value={noteSharePassword}
                      onChange={(e) => setNoteSharePassword(e.target.value)}
                      placeholder="Leave empty to auto-generate"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    />
                    <p className="text-xs text-white/40 mt-1">A random password will be generated if left empty</p>
                  </div>
                </div>

                <Button
                  onClick={handleShareNote}
                  disabled={generatingNoteShare}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                >
                  {generatingNoteShare ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Creating link...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4 mr-2" />
                      Create Share Link
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Share link created!</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Share Link</label>
                  <div className="flex gap-2">
                    <Input
                      value={noteShareUrl}
                      readOnly
                      className="bg-white/5 border-white/10 text-white text-sm font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => navigator.clipboard.writeText(noteShareUrl)}
                      className="flex-shrink-0 border-white/10 hover:bg-white/10"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Password</label>
                  <div className="flex gap-2">
                    <Input
                      value={noteShareGeneratedPassword}
                      readOnly
                      className="bg-white/5 border-white/10 text-white text-sm font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => navigator.clipboard.writeText(noteShareGeneratedPassword)}
                      className="flex-shrink-0 border-white/10 hover:bg-white/10"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(`${noteShareUrl}\n\nPassword: ${noteShareGeneratedPassword}`);
                    }}
                    variant="outline"
                    className="flex-1 border-white/10 hover:bg-white/10 text-white"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link + Password
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
