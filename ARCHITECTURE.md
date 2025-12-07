# Architecture & Code Structure

## System Architecture

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

## How Encryption Works

```
Your Device                Auth Server              Your S3/R2 Bucket
    │                           │                          │
    ├─ Encrypt file ────────────┤                          │
    ├─ Upload encrypted ────────────────────────────────────┤
    ├─ Store key in manifest ───┤                          │
    ├─ Encrypt manifest ────────────────────────────────────┤
    │                           │                          │
    └─────────────────────────────────────────────────────┘
       All keys stay on your device
       Server only sees encrypted data
```

## Project Structure

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
| `calendar.ts` | **Calendar System** - Encrypted calendar events with reminders, recurring events, tags |
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
| `FileManager.tsx` | **Main UI** (~2500 lines) - File listing, folders, notes panel, calendar, previews, sharing, context menus |
| `CalendarView.tsx` | **Calendar UI** - Month view calendar with event management, reminders, recurring events |
| `FileUpload.tsx` | Drag-and-drop upload with encryption progress |
| `ManifestUnlock.tsx` | Password prompt for unlocking encrypted manifest |
| `StorageSettings.tsx` | S3/R2 configuration form with connection testing |
| `MarkdownEditor.tsx` | Split-view markdown editor with toolbar |
| `ui/` | Radix-based UI primitives (Button, Input, Progress, etc.) |

### `/src/contexts/` - React Contexts

| Context | Purpose |
|---------|---------|
| `AuthContext.tsx` | Authentication state, token refresh, user session management |

## Security Model

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

4. **Calendar Events**:
   ```
   Event Data → JSON → Encrypt with Master Key (AES-GCM) → Upload to R2/calendar/
   Calendar Manifest → Encrypt with Master Key → Store as .calendar-manifest.enc
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
| Notes content | ❌ Encrypted |
| Calendar events | ❌ Encrypted |
| Event reminders | ❌ Encrypted |
| Master password | ❌ Never sent |
| Storage credentials | ❌ Stored locally only |
| User identity | ✅ Username, public key |

## Data Flow

### User Registration

1. User enters username and creates password
2. Client generates Ed25519 keypair
3. Client sends username + public key to auth server
4. Auth server stores user profile
5. Private key stored locally in localStorage

### File Upload

1. User selects file
2. Client generates random AES-256 key
3. File encrypted with AES-256-GCM
4. Encrypted file uploaded to S3/R2 with presigned URL
5. File metadata (key, name, size) stored in encrypted manifest
6. Manifest encrypted with PBKDF2-derived master key
7. Encrypted manifest uploaded to S3/R2

### File Download

1. User clicks file in manager
2. Client loads encrypted manifest from S3/R2
3. Client prompts for encryption password
4. PBKDF2 derives master key from password
5. Master key decrypts manifest
6. File key extracted from manifest
7. Presigned URL generated for encrypted file
8. File downloaded and decrypted client-side
9. User can preview or download plaintext

### File Sharing

1. User selects file to share
2. Client generates share password
3. Client encrypts file key with PBKDF2(share password)
4. Share bundle created: `{ encryptedKey, presignedUrl, nonce }`
5. Bundle serialized to base64
6. Share link generated: `https://cloud.unet.live/share?s=<bundle>`
7. Recipient accesses link with share password
8. Client derives key from share password
9. File decrypted and available for download

### Calendar Event Creation

1. User opens calendar and creates new event
2. Client creates event object with title, description, times, reminders, etc.
3. Event JSON encrypted with master key (AES-256-GCM)
4. Encrypted event uploaded to S3/R2 at `calendar/<event_id>.enc`
5. Event metadata (id, title, dates, reminder count) stored in calendar manifest
6. Calendar manifest encrypted with master key and uploaded to S3/R2

### Calendar Reminders

1. Client periodically checks for upcoming events with reminders
2. When event time approaches (based on reminder settings):
   - 1 day before, 1 hour before, 15 minutes before, etc.
3. Browser notification shown to user (client-side only)
4. Reminder marked as triggered in event data
5. Encrypted event re-uploaded with updated reminder state

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/check-username` | Check username availability |
| `POST /auth/register` | Register with username + public key |
| `POST /auth/login-challenge` | Get challenge for Ed25519 signature |
| `POST /auth/login-verify` | Verify signature and receive tokens |
| `POST /auth/refresh` | Refresh access token |
| `GET /profiles/me` | Get current user profile |
| `GET /api/csrf-token` | Get CSRF token |

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **UI**: React 19, Tailwind CSS 4, Radix UI
- **Crypto**: Web Crypto API, @noble/ed25519, @noble/hashes
- **Storage**: AWS SDK v3 (S3-compatible)
- **Markdown**: react-markdown, remark-gfm
- **Icons**: Lucide React
