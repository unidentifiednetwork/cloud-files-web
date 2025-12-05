# UNET Cloud - E2EE File & Notes Storage

A secure, end-to-end encrypted (E2EE) cloud storage web client built with Next.js. All encryption happens client-side - your files and notes are encrypted **before** leaving your device, ensuring zero-knowledge privacy.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![React](https://img.shields.io/badge/React-19.2-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![License](https://img.shields.io/badge/License-GPL%203.0-blue)

## 🔐 Key Features

- **End-to-End Encryption**: AES-256-GCM encryption performed entirely in browser
- **Zero-Knowledge Architecture**: Server never sees your encryption keys or unencrypted data
- **Bring Your Own Storage**: Connect your own S3/R2 bucket (Cloudflare R2, AWS S3, MinIO, etc.)
- **Encrypted Notes**: Markdown notes with tags, pinning, and secure sharing
- **Password-Protected Sharing**: Share files/notes via encrypted links
- **Folder Organization**: Organize files in folders with drag-and-drop
- **EXIF Stripping**: Automatic metadata removal from JPEG images

## 🏗 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │────▶│   Auth Server   │     │  S3/R2 Storage  │
│  (Encryption)   │     │   (UNET API)    │     │  (Your Bucket)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       ▲
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                    Encrypted data only
```

## 📁 Project Structure

### `/src/app/` - Next.js Pages

| File | Description |
|------|-------------|
| `page.tsx` | Entry point - redirects to `/files` or `/login` based on auth state |
| `login/page.tsx` | Authentication page with Ed25519 keypair generation, registration, and server selection |
| `files/page.tsx` | Main file manager dashboard with upload panel, folder navigation, and settings |
| `share/page.tsx` | Public share page for decrypting and downloading shared files/notes (no auth required) |
| `layout.tsx` | Root layout with providers and global styles |
| `globals.css` | Tailwind CSS configuration |

### `/src/lib/` - Core Libraries

| File | Purpose |
|------|---------|
| `e2ee.ts` | **E2EE Encryption Engine** - AES-256-GCM file encryption, key generation, base64 encoding, EXIF stripping |
| `manifest.ts` | **Encrypted Manifest** - Stores file metadata in R2/S3, PBKDF2 key derivation, folder management |
| `notes.ts` | **Notes System** - Encrypted markdown notes with tags, search, sharing capabilities |
| `storage-client.ts` | **S3/R2 Client** - Presigned URLs, direct upload/download to user's storage bucket |
| `crypto.ts` | **Ed25519 Cryptography** - Keypair generation for authentication signatures |
| `api.ts` | **Auth API** - User registration, login challenges, 2FA, invitation codes |
| `settings.ts` | **Settings Manager** - API server URL, storage config persistence |
| `csrf.ts` | **CSRF Protection** - Token management for API security |
| `tokenManager.ts` | **Token Refresh** - Automatic access token renewal |
| `tokenStorage.ts` | **Token Storage** - Secure cookie-based token persistence |
| `types.ts` | TypeScript interfaces for User model |
| `utils.ts` | Utility functions (cn, formatBytes, isElectronApp) |
| `drag.ts` | Drag-and-drop type detection for file manager |

### `/src/components/` - React Components

| Component | Purpose |
|-----------|---------|
| `FileManager.tsx` | **Main UI** (~2400 lines) - File listing, folders, notes panel, previews, sharing, context menus |
| `FileUpload.tsx` | Drag-and-drop upload with encryption progress |
| `ManifestUnlock.tsx` | Password prompt for unlocking encrypted manifest |
| `StorageSettings.tsx` | S3/R2 configuration form with connection testing |
| `MarkdownEditor.tsx` | Split-view markdown editor with toolbar |
| `ui/` | Radix-based UI primitives (Button, Input, Progress, etc.) |

### `/src/contexts/` - React Contexts

| Context | Purpose |
|---------|---------|
| `AuthContext.tsx` | Authentication state, token refresh, user session management |

## 🔒 Security Model

### Encryption Flow

1. **File Upload**:
   ```
   File → Strip EXIF → Generate Key (AES-256) → Encrypt (GCM) → Upload to R2
   ```

2. **Manifest**:
   ```
   Password → PBKDF2 (100k iterations) → Master Key → Encrypt Manifest → Store in R2
   ```

3. **Sharing**:
   ```
   File Key → Derive Share Key (PBKDF2) → Encrypt with Share Password → Generate URL
   ```

### Key Storage

- **Master Key**: Derived from user password, never stored
- **File Keys**: Stored in encrypted manifest on R2
- **Ed25519 Keys**: Stored in localStorage for auth signatures
- **Session**: Manifest cached in sessionStorage during active session

### What the Server Knows

| Data | Server Knowledge |
|------|------------------|
| File contents | ❌ Encrypted |
| File names | ❌ Encrypted (in manifest) |
| File keys | ❌ Never sent |
| Master password | ❌ Never sent |
| Storage credentials | ❌ Stored locally only |
| User identity | ✅ Username, public key |

## 🛠 Tech Stack

- **Framework**: Next.js 16 with App Router
- **UI**: React 19, Tailwind CSS 4, Radix UI
- **Crypto**: Web Crypto API, @noble/ed25519, @noble/hashes
- **Storage**: AWS SDK v3 (S3-compatible)
- **Markdown**: react-markdown, remark-gfm
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- S3-compatible storage bucket (Cloudflare R2 recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/unidentifiednetwork/cloud-files-web.git
cd cloud-files-web

# Install dependencies
npm install

# Set environment variable (optional - defaults to https://api.unet.live/api)
export NEXT_PUBLIC_API_URL=https://your-api-server.com/api

# Start development server
npm run dev
```

### Configuration

1. **Register/Login** at `http://localhost:3003/login`
2. **Configure Storage** in Settings:
   - Provider: Cloudflare R2 / AWS S3 / Custom
   - Endpoint URL
   - Bucket name
   - Access Key ID & Secret
3. **Create Encryption Password** - this unlocks your encrypted file manifest

## 🔗 Share Links

Files and notes can be shared via password-protected URLs:

```
https://cloud.unet.live/share?s=<encrypted_bundle>
https://cloud.unet.live/share?note=<encrypted_note_bundle>
```

The bundle contains encrypted file key and presigned download URL. Recipients need the share password to decrypt.

## 📄 API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/check-username` | Check username availability |
| `POST /auth/register` | Register with username + public key |
| `POST /auth/login-challenge` | Get challenge for Ed25519 signature |
| `POST /auth/login-verify` | Verify signature and receive tokens |
| `POST /auth/refresh` | Refresh access token |
| `GET /profiles/me` | Get current user profile |
| `GET /api/csrf-token` | Get CSRF token |

## 🤝 Contributing

Contributions are welcome! Please ensure:
- All encryption happens client-side
- No plaintext secrets in code
- TypeScript strict mode compliance

## 📜 License

GNU General Public License v3.0 - See [LICENSE](LICENSE) for details.

---

**⚠️ Security Notice**: This software performs client-side encryption. Always verify the code you're running and keep your master password secure. Lost passwords cannot be recovered.
