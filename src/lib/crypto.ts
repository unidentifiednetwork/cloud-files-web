import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// Configure ed25519
ed25519.hashes.sha512 = sha512;

export async function generateKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const publicKeyBytes = await ed25519.getPublicKey(privateKeyBytes);

  return {
    privateKey: Buffer.from(privateKeyBytes).toString("hex"),
    publicKey: Buffer.from(publicKeyBytes).toString("hex"),
  };
}

export async function signMessage(
  privateKey: string,
  message: string
): Promise<string> {
  try {
    const privateKeyBytes = Buffer.from(privateKey, "hex");
    const messageBytes = Buffer.from(message, "utf-8");

    const signature = await ed25519.sign(messageBytes, privateKeyBytes);
    return Buffer.from(signature).toString("hex");
  } catch (error) {
    console.error("Error signing message:", error);
    throw new Error("Failed to sign message");
  }
}

const KEY_PAIR_PREFIX = "key_pair_";

// Store keypair in localStorage
export async function storeKeyPair(
  userId: string,
  privateKey: string,
  publicKey: string
): Promise<void> {
  try {
    const data = JSON.stringify({ privateKey, publicKey });
    localStorage.setItem(`${KEY_PAIR_PREFIX}${userId}`, data);
  } catch (error) {
    console.error("Error storing key pair:", error);
  }
}

// Get keypair from localStorage
export async function getKeyPair(
  userId: string
): Promise<{ privateKey: string; publicKey: string } | null> {
  try {
    const data = localStorage.getItem(`${KEY_PAIR_PREFIX}${userId}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error getting key pair:", error);
  }
  return null;
}

// Get private key
export async function getPrivateKey(userId: string): Promise<string | null> {
  const keyPair = await getKeyPair(userId);
  return keyPair?.privateKey || null;
}

// Clear keypair
export async function clearKeyPair(userId: string): Promise<void> {
  localStorage.removeItem(`${KEY_PAIR_PREFIX}${userId}`);
}
