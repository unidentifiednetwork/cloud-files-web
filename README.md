# UNET Cloud - E2EE File & Notes Storage

A secure, end-to-end encrypted cloud storage built with Next.js. **Everything is encrypted on your device** before upload — your files, notes, and encryption keys never leave unencrypted.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black)
![React](https://img.shields.io/badge/React-19.2-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![License](https://img.shields.io/badge/License-GPL%203.0-blue)

## ✨ Features

- **Client-Side Encryption** - AES-256-GCM, never touches the server
- **Zero-Knowledge** - Server can't see your files, notes, or keys
- **Bring Your Own Storage** - Use Cloudflare R2, AWS S3, or any S3-compatible bucket
- **Encrypted Notes** - Markdown with tags, search, and password-protected sharing
- **Secure File Sharing** - Share files/notes with password-protected links
- **Folder Organization** - Drag-and-drop file management
- **Privacy Protection** - Automatic EXIF stripping from images

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- S3-compatible storage (Cloudflare R2 recommended)

### Install & Run

```bash
git clone https://github.com/unidentifiednetwork/cloud-files-web.git
cd cloud-files-web
npm install
npm run dev
```

Open `http://localhost:3003` and register.

### Configure Storage

1. Go to **Settings** (gear icon)
2. Choose provider: **Cloudflare R2**, **AWS S3**, or **Custom**
3. Enter your credentials:
   - Endpoint URL
   - Bucket name
   - Access Key ID & Secret
4. Test connection ✓
5. Create an encryption password

### Cloudflare R2 Setup

1. Create bucket in Cloudflare Dashboard
2. Generate API token with S3 permissions
3. In R2 bucket settings, go to **CORS** and add:

```json
[
  {
    "AllowedOrigins": ["https://cloud.unet.live"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

4. Use `https://<account-id>.r2.cloudflarestorage.com` as endpoint

## 📁 What's Inside

| Folder | Purpose |
|--------|---------|
| `/src/app/` | Pages: login, files manager, share page |
| `/src/lib/e2ee.ts` | AES-256-GCM encryption engine |
| `/src/lib/manifest.ts` | Encrypted file metadata (PBKDF2) |
| `/src/lib/notes.ts` | Encrypted markdown notes system |
| `/src/lib/storage-client.ts` | S3/R2 upload/download |
| `/src/lib/crypto.ts` | Ed25519 auth signatures |
| `/src/components/` | UI components (React) |

## 🔐 How It Works

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

**Key Points:**
- Master key: derived from your password, never stored
- File keys: encrypted in manifest on your bucket
- Server: only knows username, doesn't see files/keys

## 📦 Tech Stack

- **Next.js 16** - App Router, Server Components
- **React 19** - Client components
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **AWS SDK v3** - S3/R2 client
- **@noble/ed25519** - Auth signatures
- **Web Crypto API** - Browser encryption

## 📤 Sharing Files

Share with password-protected links:

```
https://cloud.unet.live/share?s=<encrypted_file>
https://cloud.unet.live/share?note=<encrypted_note>
```

Recipients enter the share password to decrypt. The URL contains only the encrypted bundle + presigned download link.

## 🤝 Contributing

Contributions welcome! Keep these principles:
- ✅ All encryption client-side
- ✅ No plaintext secrets in code
- ✅ TypeScript strict mode

## 📜 License

GNU General Public License v3.0 - See [LICENSE](LICENSE) for details.

---

**⚠️ Security Note:** This software encrypts in your browser. Always verify the code. If you lose your password, your files cannot be recovered.
