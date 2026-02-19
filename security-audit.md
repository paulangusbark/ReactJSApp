# ReactJS-Wallet / my-app — Security Audit Report

**Date:** 2026-02-19
**Scope:** All non-gitignored source files under `ReactJS-Wallet/my-app/src/`
**Excluded:** `node_modules/`, `dist/`, `.env`, `src/assets/`
**Auditor:** Claude Code (claude-sonnet-4-6)
**Status:** Read-only analysis. No code was modified.

**Files Reviewed:**
- `src/App.tsx`
- `src/firebase.ts`
- `src/main.tsx`
- `src/storage/keyStore.ts`
- `src/storage/authStore.ts`
- `src/storage/domainStore.ts`
- `src/storage/profileStore.ts`
- `src/context/AuthContext.tsx`
- `src/crypto/falconInterface.ts`
- `src/crypto/falconClient.ts`
- `src/crypto/falcon.worker.ts`
- `src/crypto/rpcConnectionManager.ts`
- `src/services/bundlerClient.ts`
- `src/lib/submitTransaction.ts`
- `src/lib/wallets.ts`
- `src/lib/bytesEncoder.ts`
- `src/lib/sharePayload.ts`
- `src/lib/shareImporters.ts`
- `src/lib/shareBuilders.ts`
- `src/lib/refreshBalances.ts`
- `src/lib/predictQuantumAccountAddress.ts`
- `src/lib/parseAbiArgs.ts`
- `src/pages/LoginPage.tsx`
- `src/pages/transaction.tsx`
- `src/components/ui/QrScanner.tsx`

---

## Finding Count Summary

| Severity      | Count |
|---------------|-------|
| Critical      | 1     |
| High          | 5     |
| Medium        | 6     |
| Low           | 4     |
| Informational | 4     |
| **Total**     | **20**|

---

## Section 1 — Critical Findings

---

### [C-1] AES-GCM Wrapping Key Stored as Extractable Raw Bytes in IndexedDB — Falcon Secret Key Is Effectively Unprotected

**File:** `src/storage/keyStore.ts`
**Lines:** 47–54
**Severity:** CRITICAL

**Description:**
The Falcon secret key (used to sign all user operations) is encrypted with an AES-GCM wrapping key before being stored in IndexedDB. However, the wrapping key itself is generated as `extractable: true` and immediately exported to raw bytes, which are then stored in IndexedDB alongside the encrypted key material:

```ts
const fresh = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true, // extractable: true → export to raw bytes for IndexedDB storage
  ["encrypt", "decrypt"]
);

const exported = await crypto.subtle.exportKey("raw", fresh);
await set(WRAPPING_KEY_ID, exported);  // raw key bytes stored in IDB
```

Any JavaScript code running on the same origin (including malicious browser extensions with `storage` access, injected scripts via XSS, or any code that can reach the IndexedDB API) can retrieve both the wrapping key bytes and the encrypted Falcon ciphertext. Decryption requires only:
1. `get(WRAPPING_KEY_ID)` → raw AES key bytes
2. `crypto.subtle.importKey("raw", raw, "AES-GCM", ...)` → reconstructed `CryptoKey`
3. `crypto.subtle.decrypt(...)` → plaintext Falcon secret key

This is functionally equivalent to storing the Falcon secret key in plaintext in IndexedDB. The encryption layer provides no meaningful protection against any adversary capable of running JavaScript on the origin.

**Impact:**
- Any XSS vulnerability, malicious browser extension, or compromised dependency can extract the Falcon secret key.
- The extracted secret key can be used to sign arbitrary user operations, rotating the account's public key, stealing funds, or performing any on-chain action on the user's QuantumAccount.
- This affects all users of the wallet — every deployed instance stores the Falcon SK in a recoverable form.

**Recommendation:**
Use the Web Crypto API's non-extractable key binding. Prefer `extractable: false` combined with a hardware-backed key where possible. The correct pattern is to derive the wrapping key from a user-supplied passphrase (PBKDF2 or Argon2) or to store the wrapping key as a non-extractable `CryptoKey` in a `CryptoKeyStore` (where supported), so that the browser itself enforces that the key cannot be exported. If IndexedDB persistence of a wrapping key is required, consider using the [`secure-storage`](https://developer.mozilla.org/en-US/docs/Web/API/Lock) pattern or a passphrase-derived key that is never stored.

---

## Section 2 — High Findings

---

### [H-1] Falcon Worker Spawned Per Signing Call and Never Terminated — Secret Key Lingers in Worker Heap

**Files:** `src/lib/submitTransaction.ts` (line 327), `src/lib/wallets.ts` (line 52), `src/storage/keyStore.ts` (line 129)
**Severity:** HIGH

**Description:**
Three separate code paths spawn a new `Worker` for every cryptographic operation by calling `createFalconWorkerClient()` directly, and none of them call `falcon.terminate()` afterwards:

```ts
// submitTransaction.ts — every transaction
const falcon = createFalconWorkerClient();
const sk = await getFalconSecretKey(falconLevel);
const signature = await falcon.sign(falconLevel, hexToBytes(userOpHash), sk);
sk.fill(0);  // zeroes the main-thread copy only
// falcon.terminate() ← never called

// wallets.ts — every account creation
const falcon = createFalconWorkerClient();
const signature = await falcon.sign(falconLevel, rawMessage, await getSecretKey(falconLevel));
// falcon.terminate() ← never called

// keyStore.ts — every keypair generation
const falcon = createFalconWorkerClient();
const { pk, sk } = await falcon.generateKeypair(level);
// falcon.terminate() ← never called
```

**Compound problem — sk.fill(0) provides false security:**
The Falcon secret key is passed to the worker via `postMessage` (structured clone). A copy of the key's bytes is placed in the Worker's heap. The `sk.fill(0)` in `submitTransaction.ts` (line 338) correctly zeroes the main-thread `Uint8Array`, but the Worker's copy of the key — which was cloned on `postMessage` — is never zeroed. Because the Worker is never terminated, the secret key bytes survive in the Worker's memory for the entire session.

A singleton client already exists in `src/crypto/falconClient.ts` (`getFalconClient()`) but is not used by any of these callers, which is the same pattern found in `CointrolPaymentGateway` H-3.

**Impact:**
- Every transaction leaks a persistent copy of the Falcon secret key into a non-GC'd worker thread.
- Accumulated threads consume OS resources; under repeated use the tab may crash.
- The security zeroing of `sk` is ineffective.

**Recommendation:**
Use the singleton from `falconClient.ts` for `verify` and `sign` operations. For `generateKeypair`, create a worker, use it, then call `.terminate()` immediately after. Consider a design where the secret key is decrypted inside the worker itself (key stays in worker, never crosses the thread boundary).

---

### [H-2] Hardcoded entryPoint, factory, and falcon Addresses in keyStore.ts — Multi-Domain Address Prediction Is Broken

**File:** `src/storage/keyStore.ts`
**Lines:** 198–200
**Severity:** HIGH

**Description:**
`getAddress()` — the function that predicts the user's QuantumAccount contract address — uses three hardcoded Sepolia contract addresses:

```ts
const entryPointAddress = `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`; // need to replace with domain look up
const factoryAddress = `0xf3C6758D283e28d99eda462009D776458C1DdE4a`; // need to replace with domain look up
const falconAddress = `0x6f70f3475c89AFab28A7c607a645A773Ea76dB45`; // need to replace with domain look up
```

The developer's own comments acknowledge this is wrong. For a multi-domain wallet (the core architectural feature), this means:

1. The CREATE2 address shown to users is always computed against the Sepolia deployment, regardless of which domain/chain the user is operating on.
2. Users on other chains (or using different factory deployments) will see and use a wrong account address.
3. Funds sent to the predicted address on the correct chain may never be recoverable if that address corresponds to a different contract (or no contract) on that chain.
4. The bundler's `getDomainDetails` endpoint exists specifically to provide these addresses per-domain, but its response is never used for address prediction.

**Recommendation:**
Fetch the `entryPoint`, `factory`, and `falcon` addresses from the bundler's domain details endpoint (or from the local `domainStore`) before calling `predictQuantumAccountAddress`. The `domainStore` already has `entryPoint` and `paymaster` fields; `factory` and `falcon` should be added.

---

### [H-3] All Backend URLs Hardcoded to `http://localhost` — No TLS, No Configurability

**Files:** `src/lib/submitTransaction.ts` (lines 117–118), `src/services/bundlerClient.ts` (lines 126, 145, 162, 179)
**Severity:** HIGH

**Description:**
Every outbound API call uses hardcoded `localhost` HTTP URLs:

```ts
// submitTransaction.ts
const BUNDLER = `http://localhost:8080/userop` as string;
const PAYMASTER = `http://localhost:8081/pmg` as string;

// services/bundlerClient.ts
const res = await fetch(`http://localhost:8081/createfree`, { ... });
const res = await fetch(`http://localhost:8080/submit`, { ... });
const res = await fetch(`http://localhost:8080/domain`, { ... });
const res = await fetch(`http://localhost:8080/domain/${id}`, { ... });
```

**Issues:**
1. **No TLS:** All wallet-to-bundler communication is over plain HTTP. The signature sent to the bundler and any domain details returned from it are transmitted in cleartext, exposable to any network observer or local process.
2. **Not configurable:** There is no environment variable, config file, or runtime setting that changes these URLs. A production or staging deployment cannot be made without modifying source code.
3. **Port inconsistency:** `submitTransaction.ts` and `services/bundlerClient.ts` both target different local ports in different places.
4. **No request authentication:** The fetch calls include no bearer token, HMAC, or session identifier. Any process on the same machine can make identical requests to the bundler.

**Recommendation:**
Source all backend URLs from `import.meta.env.VITE_BUNDLER_URL` and `import.meta.env.VITE_PAYMASTER_URL`. Enforce HTTPS in non-development environments. The Vite `.env.example` comment in `App.tsx` (lines 28–32) already documents the intended env vars; they should be wired into the fetch calls.

---

### [H-4] Two `createAccountToBytes` Functions with Incompatible Encodings — Account Creation Signatures Will Not Verify

**Files:** `src/lib/bytesEncoder.ts` (line 44), `src/services/bundlerClient.ts` (line 70)
**Severity:** HIGH

**Description:**
Two identically-named exported functions exist in the codebase with fundamentally different byte encodings:

**`lib/bytesEncoder.ts` (used by `wallets.ts` for signing):**
```ts
const senderBytes  = hexToBytes(newAccount.sender);    // 20 raw bytes
const pubKeyBytes  = hexToBytes(newAccount.publicKey); // raw key bytes
const saltBytes    = hexToBytes(newAccount.salt);      // raw salt bytes
const domainBytes  = encoder.encode(newAccount.domain); // UTF-8 string
```

**`services/bundlerClient.ts` (standalone, currently unused for signing):**
```ts
const senderBytes  = encoder.encode(newAccount.sender);    // UTF-8 of "0x1234…" (42 bytes)
const domainBytes  = encoder.encode(newAccount.domain);    // UTF-8 string
const saltBytes    = encoder.encode(newAccount.salt);      // UTF-8 of "0x…" (66 bytes)
const pubKeyBytes  = encoder.encode(newAccount.publicKey); // UTF-8 of "0x…" (1794 bytes)
```

`wallets.ts` correctly imports from `lib/bytesEncoder.ts`. However, the second implementation in `services/bundlerClient.ts` is a latent trap: any future code path that imports `createAccountToBytes` from `services/bundlerClient.ts` (the module that also contains `BundlerAPI` and `PaymasterAPI`) will produce a message whose Falcon signature cannot be verified by the paymaster backend — silently breaking account creation.

Additionally, `services/bundlerClient.ts` also re-exports `calculateUserOpHash` — a completely separate, duplicate implementation of the EIP-712 hash from `submitTransaction.ts` — making the codebase's authority on the canonical encoding unclear.

**Impact:**
- Immediate confusion for developers maintaining the codebase.
- Any future import of the wrong `createAccountToBytes` causes undetectable signature failures.
- The existing correct flow in `wallets.ts` may diverge from the backend's expectations if the backend adopts the UTF-8 approach.

**Recommendation:**
Delete the `createAccountToBytes` function from `services/bundlerClient.ts` and consolidate all encoding logic in `lib/bytesEncoder.ts`. Similarly, consolidate `calculateUserOpHash` to a single canonical location. Cross-reference with `CointrolPaymentGateway` audit finding M-3, which documents the same naming collision between the server-side implementations.

---

### [H-5] Unvalidated `rpcUrl` from User-Controlled Domain Store Used to Initiate HTTP Connections

**Files:** `src/lib/refreshBalances.ts` (line 53), `src/lib/submitTransaction.ts` (line 294), `src/pages/transaction.tsx` (line 629)
**Severity:** HIGH

**Description:**
The `rpcUrl` field of a `Domain` object is accepted with no URL validation and is passed directly to viem's `http()` transport, causing outbound HTTP requests to be made to whatever host is stored:

```ts
// refreshBalances.ts — balance refresh
const rpcUrl = domains.find(d => d.chainId === chainId)?.rpcUrl;
const client = createPublicClient({ transport: http(rpcUrl) }); // no validation

// submitTransaction.ts — every transaction
const publicClient = createPublicClient({ transport: http(domain.rpcUrl) }); // no validation

// transaction.tsx — every read call
const client = createPublicClient({ transport: http(selectDomain?.rpcUrl) }); // no validation
```

The `domainStore.ts` `addDomain` function accepts any string for `rpcUrl` without format validation, allowlisting, or scheme enforcement:

```ts
rpcUrl: string; // rpc url used locally by app
```

**Impact:**
- A user or QR-code payload that adds a domain with `rpcUrl: "http://192.168.1.1/admin"` causes the wallet to send authenticated-looking JSON-RPC POST requests to internal network resources.
- An attacker who gains access to the user's IndexedDB (or who can convince the user to add a malicious domain) can redirect all balance reads and nonce lookups to a malicious endpoint, receiving forged blockchain state.
- If the malicious RPC endpoint returns a crafted nonce, it could cause transactions to be submitted with an incorrect nonce, causing failures or replay opportunities.

**Recommendation:**
Validate `rpcUrl` against an allowlist of permitted schemes (`https://` only in production) and block RFC 1918 private IP ranges and link-local addresses before the URL is stored. Apply the same validation in `addDomain` that `CointrolPaymentGateway` should have applied (CPG H-4).

---

## Section 3 — Medium Findings

---

### [M-1] Falcon Secret Key Zeroed in Main Thread but Clone Persists in Worker Heap

**File:** `src/lib/submitTransaction.ts`
**Lines:** 334–338
**Severity:** MEDIUM

**Description:**
```ts
const signature = await falcon.sign(falconLevel, hexToBytes(userOpHash), sk);
const userOp: PackedUserOperation = { ...userOpBase, signature: bytesToHex(signature) };
sk.fill(0); // zero out secret key from memory as soon as possible
```

The zero-fill on line 338 operates on the `sk` reference in the main thread. However, the `Worker.postMessage` call that sent `sk` to the worker (inside `falcon.sign`) uses the structured clone algorithm, which creates an independent copy of the `Uint8Array`'s underlying buffer in the worker's address space. The worker's copy:

1. Is never zeroed — `falcon.worker.ts` has no cleanup on the `req.sk` parameter.
2. Persists for the entire worker lifetime (which is indefinite, per H-1).

The `sk.fill(0)` provides developers with a false sense of security; the actual key material survives the zero-fill in a separate thread.

**Recommendation:**
Either (a) redesign the signing flow so the decrypted SK never leaves the worker (decrypt inside the worker, pass only the ciphertext and IDB record reference), or (b) terminate the worker immediately after signing so the OS reclaims the worker's memory. In the worker itself, zero `req.sk` after `api.sign()` completes.

---

### [M-2] `getBalance()` in transaction.tsx Uses Floating-Point Arithmetic for Token Amounts — Incorrect Scaling for Non-Integer Values

**File:** `src/pages/transaction.tsx`
**Lines:** 156–160
**Severity:** MEDIUM

**Description:**
```ts
function getBalance(value = 0, decimals: number): bigint {
  if (decimals <= 0) return BigInt(value);
  if (value < 0) return BigInt(0);
  return BigInt(value * (10 ** decimals)); // ← floating-point multiplication
}
```

The `value * (10 ** decimals)` expression uses JavaScript's IEEE-754 double-precision arithmetic. For tokens with 18 decimals (ETH, most ERC-20s), any non-integer amount like `0.1` produces a floating-point result that cannot be safely converted to `BigInt`:
- `0.1 * 1e18` = `100000000000000000` (appears correct, but is non-deterministic at the implementation level)
- `0.3 * 1e18` = `299999999999999968` (incorrect — 32 units short)
- For amounts that produce a decimal floating-point result (e.g., `1.1 * 1e18 = 1100000000000000000.2`), `BigInt(...)` will throw a `RangeError: The number 1.1e+18 cannot be converted to a BigInt because it is not an integer`

This function is called in `buildArgs()` to scale the amount field of a token transfer:
```ts
if (key === "value" && transferOrTransaction) {
  return getBalance(Number(argValues[key]), selectCoin?.decimals ?? 18);
}
```

For a user trying to send `1.1 ETH`, the call throws a `RangeError` which propagates to `handleBuildCalldata`, setting an error state. More dangerously, amounts that appear to convert successfully may be off by a small amount due to floating-point rounding.

The correct implementation exists in the same file's dependencies: `parseBalance` in `submitTransaction.ts` uses pure string/BigInt arithmetic and handles all edge cases correctly.

**Recommendation:**
Replace `getBalance` with a call to `parseBalance` from `submitTransaction.ts`, which performs string-based decimal scaling with explicit precision handling.

---

### [M-3] `deriveUserSalt` — Firebase UID Is the Sole HKDF Input, Producing a Deterministic, Non-Device-Bound Salt

**File:** `src/context/AuthContext.tsx`
**Lines:** 24–47
**Severity:** MEDIUM

**Description:**
The device UUID (used as the `salt` parameter for quantum account address derivation) is derived exclusively from the Firebase user UID:

```ts
async function deriveUserSalt(uid: string): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(uid), "HKDF", ...);
  const bits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: enc.encode("Cointrol QuantumAccount v1"),  // constant
    info: enc.encode("Account Generation Salt"),      // constant
  }, keyMaterial, 256);
  ...
}
```

Because both the HKDF `salt` and `info` are constants, and `uid` is the sole variable input, the derived UUID is **identical across all devices for the same Firebase UID**. The user-facing message in `LoginPage.tsx` states: *"A unique wallet identifier will be generated for your device"* — this claim is incorrect. The identifier is per-user, not per-device.

**Consequences:**
1. A user who signs in on a second device automatically reuses the same salt, deriving the same account address. This may be intentional for account recovery UX, but is undocumented and conflicts with the UI text.
2. Firebase UIDs may be exposed through network traffic analysis or Firebase service interactions. Knowing the UID allows an adversary to precompute the account salt.
3. If the same user registers with a different provider (e.g., Google vs. GitHub), Firebase issues different UIDs, creating different salts and different account addresses — fragmented identity.

**Recommendation:**
Clarify the intended semantics. If per-device identity is desired, mix in a device-specific random secret (stored in IDB on first launch, never synced). If per-user identity is desired, update the UI text and document that the same account address will be produced on any device. Either way, remove the misleading "for your device" messaging.

---

### [M-4] `parseAbiArg` Passes Raw `JSON.parse` Output for Array Types Without Schema Validation

**File:** `src/lib/parseAbiArgs.ts`
**Lines:** 19–26
**Severity:** MEDIUM

**Description:**
```ts
if (type.endsWith("[]")) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    throw new Error(`Invalid array JSON for type ${type}`);
  }
}
```

For array-typed ABI parameters, the function returns the direct output of `JSON.parse` on user input. The parsed value may be:
- An object instead of an array (e.g., `{"foo": "bar"}`), which `JSON.parse` accepts silently but `encodeFunctionData` will reject.
- A deeply nested array (e.g., `[[[[...]]]]`) that could cause excessive stack depth when processed by viem's ABI encoder.
- An array containing prototype-polluting keys (e.g., `[{"__proto__": {"isAdmin": true}}]`) — though viem processes these as simple data, JavaScript prototype pollution is a historical concern with `JSON.parse` of untrusted input.

When the malformed parsed value reaches `encodeFunctionData`, the error thrown propagates to `handleBuildCalldata`'s catch block and is displayed as `formError`. The user sees a raw viem error message that may leak internal details about the ABI encoding process.

**Recommendation:**
After `JSON.parse`, verify that the result is an actual `Array` before returning it:
```ts
const parsed = JSON.parse(value || "[]");
if (!Array.isArray(parsed)) throw new Error(`Expected array for type ${type}`);
return parsed;
```
Also consider adding a maximum array length guard for unbounded array types.

---

### [M-5] QR Payload Decompression Size Guard Applied Post-Decompression Only — Potential Memory DoS

**File:** `src/lib/sharePayload.ts`
**Lines:** 85–96
**Severity:** MEDIUM

**Description:**
```ts
export function decodeSharePayload(text: string): SharePayload {
  const packed = text.startsWith(SHARE_PREFIX) ? text.slice(SHARE_PREFIX.length) : text;
  const json = decompressFromEncodedURIComponent(packed);  // ← decompression first
  if (!json) throw new Error("Invalid or unsupported QR payload");

  // size guard (post-decompression)
  if (json.length > 200_000) throw new Error("Payload too large");
  ...
}
```

The size guard is applied **after** `decompressFromEncodedURIComponent` has already expanded the payload. LZ-string can produce decompression ratios of 50:1 or more. A carefully crafted compressed payload of a few kilobytes (well within QR code capacity) could expand to many megabytes before the guard is triggered.

The guard then throws, abandoning the large string — but by then, JavaScript's garbage collector must reclaim the allocated memory. In a browser tab with limited memory, a crafted QR code could cause:
1. A temporary multi-MB memory spike, potentially crashing the tab on memory-constrained mobile devices.
2. GC pressure that causes UI freeze during the collection.

**Recommendation:**
Add a pre-decompression length guard against the compressed input:
```ts
if (packed.length > 5000) throw new Error("QR payload compressed data exceeds size limit");
```
This caps the input before any decompression work is done.

---

### [M-6] Falcon Level Hardcoded to 512 — Incorrect Level Used on Accounts with Falcon-1024 Verifier Will Silently Burn Credits

**Files:** `src/lib/wallets.ts` (line 10), `src/lib/submitTransaction.ts` (line 328)
**Severity:** MEDIUM

**Description:**
All active signing code paths hardcode `falconLevel: FalconLevel = 512`:

```ts
// wallets.ts
const falconLevel: FalconLevel = 512; // example for now, will replace with user choice later

// submitTransaction.ts
const falconLevel: FalconLevel = 512; // example for now, will replace with user choice later
```

The codebase is capable of generating and storing both Falcon-512 and Falcon-1024 keypairs (`keyStore.ts` supports both levels). However, the `getAddress()` function and all signing flows always use Falcon-512.

A QuantumAccount deployed with a Falcon-1024 verifier contract (as set in `domainStore.ts`'s `falcon` field) will reject any Falcon-512 signature with `SIG_VALIDATION_FAILED`. The EntryPoint still debits the paymaster for the failed operation (see Falcon contract audit M-4: *credits burned on reverted operations*). The user sees a generic error with no indication that the wrong key type was used.

**Recommendation:**
The Falcon level must be determined at account-creation time and stored alongside the `Folio` or `Domain` record. The signing level must be read from that stored value, not hardcoded. Until this is implemented, document clearly that the wallet only supports Falcon-512 accounts and that using a Falcon-1024 verifier domain will result in every transaction failing.

---

## Section 4 — Low Findings

---

### [L-1] Hardcoded Sepolia Etherscan URL in Transaction List — Incorrect for Any Other Chain

**File:** `src/pages/transaction.tsx`
**Lines:** 787–791
**Severity:** LOW

**Description:**
```ts
onClick={() => {
  if (item.transactionHash) {
    window.open(`https://sepolia.etherscan.io/tx/${item.transactionHash}`, "_blank", "noopener,noreferrer");
  }
}}
```

The comment in the code (`// need to replace url with domain value (transactionUrl)`) acknowledges this is a placeholder. The `Domain` type in `domainStore.ts` already has a `transactionUrl` field:
```ts
transactionUrl: string; // etherscan url for tx (or equivalent)
```

Transactions on non-Sepolia chains will link to the Sepolia Etherscan page, which will show "Transaction not found." Users who rely on this link to verify their transactions on mainnet, Arbitrum, or any other chain will be unable to do so.

**Recommendation:**
Look up the correct `transactionUrl` from the transaction's associated folio/domain and use `${domain.transactionUrl}${item.transactionHash}` for the link.

---

### [L-2] Firebase UID Logged to Browser Console on Every Auth State Change

**File:** `src/context/AuthContext.tsx`
**Lines:** 73, 80
**Severity:** LOW

**Description:**
```ts
console.log("[Auth] redirect result:", res?.user?.uid ?? null);
console.log("[Auth] state changed:", user?.uid ?? null);
```

The Firebase UID is logged to the browser console on every authentication event. UIDs are permanent, immutable identifiers tied to the user's account across all Firebase services.

Given that `deriveUserSalt` uses the UID as the sole HKDF input (M-3), exposure of the UID could allow precomputation of the user's wallet salt. Additionally:
- Browser console logs are accessible to all browser extensions.
- Some browser configurations persist console history.
- Error reporting tools (if integrated) may capture console output and send UIDs to external servers.

**Recommendation:**
Remove UID logging from production builds. Use `import.meta.env.DEV` to gate debug-level logging:
```ts
if (import.meta.env.DEV) console.log("[Auth] state changed:", user?.uid ?? null);
```

---

### [L-3] `src/old_App.js` — Legacy File Left in Source Tree

**File:** `src/old_App.js`
**Severity:** LOW

**Description:**
An `old_App.js` file exists alongside the active `src/App.tsx`. Legacy files in the source tree:
1. May contain outdated security patterns (e.g., older fetch calls, unvalidated inputs, or previous API keys used during development).
2. Confuse future auditors and developers about which code is authoritative.
3. May be accidentally imported if file extensions are omitted in an import statement.
4. Are included in bundle analysis tools, increasing the apparent attack surface.

**Recommendation:**
Delete `src/old_App.js` from the repository. If the file contains historically important logic, archive it in a git commit message or development notes rather than in the source tree.

---

### [L-4] `domainStore.ts` Built-in Domain Uses a Public, Unauthenticated RPC Endpoint

**File:** `src/storage/domainStore.ts`
**Lines:** 23–33
**Severity:** LOW

**Description:**
```ts
const BUILTIN_DOMAINS: Domain[] = [{
  name: "ETHEREUM SEPOLIA",
  ...
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  ...
}];
```

The built-in domain's RPC URL points to a public, unauthenticated endpoint operated by a third party (`publicnode.com`). All balance reads, nonce lookups, and contract calls for the Sepolia domain route through this endpoint.

**Risks:**
1. **Rate limiting:** Public endpoints impose rate limits. A wallet with many folios or frequent balance refreshes may be throttled, breaking the UI.
2. **Third-party trust:** All blockchain state reads (balances, nonces) are trusted data from this provider. A compromised or malicious provider could return forged state.
3. **Privacy:** Every address the user monitors is disclosed to `publicnode.com` via `eth_getBalance` and `eth_call` queries. This is a metadata privacy concern for users who wish to keep their addresses private.

**Recommendation:**
Allow users to configure their own RPC URL per domain. Prefer using the bundler's configured RPC (via `getDomainDetails`) rather than a separate hardcoded public endpoint. For privacy-sensitive users, document that a self-hosted or paid authenticated RPC endpoint should be used.

---

## Section 5 — Informational Findings

---

### [I-1] No Content Security Policy Configured for the Vite Application

**Severity:** INFORMATIONAL

**Description:**
The application has no Content Security Policy (CSP) header or `<meta>` tag. The wallet handles Falcon secret keys, signs user operations, and makes financial API calls. Without a CSP:

- Any successfully injected script (via XSS in a user-controlled field such as a contact name, coin symbol, or contract ABI) executes with full origin privileges and can access IndexedDB, including the wrapping key and encrypted secret key (C-1).
- Fetch calls to arbitrary URLs cannot be restricted.
- Inline event handlers and scripts are permitted by default.

Given that the wallet renders user-supplied data (contact names, coin names, contract ABIs, domain names) in the DOM, a CSP is an important defence-in-depth layer.

**Recommendation:**
Add a strict CSP via Vite's `html` plugin or the web server serving the built assets. At minimum: `default-src 'self'; script-src 'self'; connect-src 'self' <bundler-url> <paymaster-url> <firebase-urls>;`.

---

### [I-2] `createFalconWorkerClient` Exported from falconInterface.ts — Singleton Not Used by Key Storage or Signing Paths

**Files:** `src/crypto/falconClient.ts`, `src/storage/keyStore.ts`, `src/lib/submitTransaction.ts`
**Severity:** INFORMATIONAL

**Description:**
`falconClient.ts` provides `getFalconClient()` — a singleton that reuses a single worker thread. This mirrors the same dead-singleton pattern found in `CointrolPaymentGateway` (CPG I-1). None of the three signing or key-generation call sites (`submitTransaction.ts`, `wallets.ts`, `keyStore.ts`) use the singleton. All three import and call `createFalconWorkerClient()` directly.

This pattern is noted as a contributing factor to H-1.

---

### [I-3] `AuthContext.tsx` — `onAuthStateChanged` Callback May Update State After Component Unmount

**File:** `src/context/AuthContext.tsx`
**Lines:** 64–91
**Severity:** INFORMATIONAL

**Description:**
The `cancelled` flag is set in the cleanup returned by `useEffect`, but the `onAuthStateChanged` callback's async continuation — specifically `await ensureDeviceUuid()` followed by `setUuidState(id)` — is not guarded against post-unmount execution:

```ts
const unsub = onAuthStateChanged(auth, async (user) => {
  if (cancelled) return; // ← checked synchronously
  ...
  const id = await ensureDeviceUuid(); // ← async; unmount can happen here
  setUuidState(id); // ← may fire after unmount
});
```

If the component unmounts while `ensureDeviceUuid()` is awaiting, React will log a "Can't perform a state update on an unmounted component" warning. In development builds with React Strict Mode (which mounts/unmounts components twice), this may produce spurious warnings that mask genuine issues.

**Recommendation:**
Re-check `cancelled` after each `await` inside the `onAuthStateChanged` callback, similar to the pattern used in `App.tsx`'s `initWallet` effect.

---

### [I-4] `predictQuantumAccountAddress.ts` — Full Contract Bytecode Hardcoded in Source — Will Diverge from Deployments

**File:** `src/lib/predictQuantumAccountAddress.ts`
**Lines:** 16–17
**Severity:** INFORMATIONAL

**Description:**
The full `QuantumAccount` creation bytecode (a 2,739-byte hex string) is hardcoded in the frontend source:

```ts
export const QUANTUM_ACCOUNT_CREATION_CODE: Hex =
  "0x60c060405234801561000f575f5ffd...";
```

The CREATE2 address calculation depends on the exact bytecode. If the contract is redeployed with any changes (bug fix, optimization, new feature), the frontend's hardcoded bytecode will produce incorrect predicted addresses, silently breaking account lookup for all new accounts.

Additionally, a 5,478-character bytecode constant embedded in the JavaScript bundle increases bundle size and is opaque to code reviewers.

**Recommendation:**
Store the creation bytecode in a build-time artifact (e.g., fetched from the contract artifacts JSON generated by Foundry/Hardhat) rather than hardcoding it. Alternatively, expose a `predictAddress` view function on the factory contract and call it via the public client, eliminating the need for off-chain bytecode replication.

---

*End of Report — All 20 findings documented.*
