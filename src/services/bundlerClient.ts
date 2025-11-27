export type BytesLike = Uint8Array | string;
export type Hex = `0x${string}`;

export interface CreateNewAccountUnsigned {
  sender: string;           // address
  domain: string;           // human-readable name
  publicKey: Hex;           // 0x-prefixed hex bytes
  createPaymaster: string;  // address
  registerPaymaster: string;// address
}

export interface CreateNewAccount extends CreateNewAccountUnsigned {
  signature: Hex;           // 0x-prefixed hex bytes
}

// --- helpers ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${hex}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// --- your encoder ---


export function createAccountToBytes(
  newAccount: CreateNewAccountUnsigned
): Uint8Array {
  const encoder = new TextEncoder();

  // Variable-length string → UTF-8
  const domainBytes = encoder.encode(newAccount.domain);

  // Addresses & public key are hex → raw bytes
  const senderBytes         = hexToBytes(newAccount.sender);
  const pubKeyBytes         = hexToBytes(newAccount.publicKey);
  const createPayBytes      = hexToBytes(newAccount.createPaymaster);
  const registerPayBytes    = hexToBytes(newAccount.registerPaymaster);

  // Optional: prefix domain with its length (uint16) so it’s unambiguous
  const domainLen = new Uint8Array(2);
  domainLen[0] = (domainBytes.length >> 8) & 0xff;
  domainLen[1] = domainBytes.length & 0xff;

  const packed = concatBytes([
    senderBytes,        // 20 bytes
    createPayBytes,     // 20 bytes
    registerPayBytes,   // 20 bytes
    pubKeyBytes,        // whatever size your key is (e.g. 1792)
    domainLen,          // 2 bytes
    domainBytes,        // variable
  ]);

  return packed;
}

export async function sendCreateAccountToBundler(
  account: CreateNewAccount
) {
  const res = await fetch("http://localhost:8080/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(account),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bundler /create error: ${res.status} ${text}`);
  }

  return res.json(); // or res.text() depending on your API
}