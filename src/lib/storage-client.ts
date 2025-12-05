// S3/R2 Storage Client
// Direct client-side interaction with S3-compatible storage
// Uses presigned URLs for secure uploads without exposing credentials

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageConfig } from "./settings";

let s3Client: S3Client | null = null;

// Initialize S3 client with config
export function initializeS3Client(config: StorageConfig): S3Client {
  s3Client = new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true, // Required for R2 and some S3-compatible services
  });
  
  return s3Client;
}

// Get current S3 client
export function getS3Client(): S3Client | null {
  return s3Client;
}

// Clear S3 client
export function clearS3Client(): void {
  s3Client = null;
}

// Generate presigned URL for upload
export async function getUploadPresignedUrl(
  config: StorageConfig,
  key: string,
  contentType: string = "application/octet-stream",
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const client = s3Client || initializeS3Client(config);
  
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

// Generate presigned URL for download
export async function getDownloadPresignedUrl(
  config: StorageConfig,
  key: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const client = s3Client || initializeS3Client(config);
  
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

// Upload file directly to S3/R2
export async function uploadToStorage(
  config: StorageConfig,
  key: string,
  data: Uint8Array,
  contentType: string = "application/octet-stream",
  onProgress?: (progress: number) => void
): Promise<void> {
  const uploadUrl = await getUploadPresignedUrl(config, key, contentType);
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload error: Network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"));
    });

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(data as any);
  });
}

// Download file from S3/R2
export async function downloadFromStorage(
  config: StorageConfig,
  key: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const downloadUrl = await getDownloadPresignedUrl(config, key);
  
  const response = await fetch(downloadUrl);
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = parseInt(contentLength || "0", 10);

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    loaded += value.length;

    if (onProgress && total) {
      onProgress((loaded / total) * 100);
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Delete file from S3/R2
export async function deleteFromStorage(
  config: StorageConfig,
  key: string
): Promise<void> {
  const client = s3Client || initializeS3Client(config);
  
  const command = new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  await client.send(command);
}

// List files in bucket
export async function listFiles(
  config: StorageConfig,
  prefix?: string,
  maxKeys: number = 1000
): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const client = s3Client || initializeS3Client(config);
  
  const command = new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await client.send(command);
  
  return (response.Contents || []).map((item) => ({
    key: item.Key || "",
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

// Check if file exists
export async function fileExists(
  config: StorageConfig,
  key: string
): Promise<boolean> {
  const client = s3Client || initializeS3Client(config);
  
  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

// Get file metadata
export async function getFileMetadata(
  config: StorageConfig,
  key: string
): Promise<{ size: number; lastModified: Date; contentType: string } | null> {
  const client = s3Client || initializeS3Client(config);
  
  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    const response = await client.send(command);
    
    return {
      size: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (error) {
    return null;
  }
}

// Test storage connection
export async function testStorageConnection(config: StorageConfig): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = initializeS3Client(config);
    
    // Try to list objects (limited to 1) to test connection
    const command = new ListObjectsV2Command({
      Bucket: config.bucket,
      MaxKeys: 1,
    });

    await client.send(command);
    
    return {
      success: true,
      message: "Connection successful",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
