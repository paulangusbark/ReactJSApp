import { PaymasterAPI, BundlerAPI, GenericResponse } from "./submitTransaction";
import { isKeyStoreInitialised, getPublicKey, getSecretKey, listKeypairs } from "../storage/keyStore";
import { createFalconWorkerClient } from "@/crypto/falconInterface";
import { createAccountToBytes } from "./bytesEncoder";
import {
  bytesToHex,
  hexToBytes,
  Address,
  type Hex,
} from "viem";
import { Domain } from "../storage/domainStore";
import { Folio } from "../storage/folioStore";

export async function initWallet(): Promise<void> {
  if (!isKeyStoreInitialised()) throw new Error("keyStore not initialised — call initKeyStore(uid) first");
}

export async function createQuantumAccount({
  sender,
  domain,
  salt,
  keypairId,
}: {
  sender: Address;
  domain: Domain;
  salt: Hex;
  keypairId: string;
}): Promise<{ success: boolean; paymaster: string }> {
  const keypairs = await listKeypairs();
  const meta = keypairs.find(k => k.id === keypairId);
  if (!meta) throw new Error(`Keypair ${keypairId} not found`);
  if (meta.level === "ECC") throw new Error("ECC keys not yet implemented");

  const publicKey = await getPublicKey(keypairId);
  if (!publicKey) throw new Error("No public key available");

  const rawMessage = createAccountToBytes({
    sender,
    domain: domain.name,
    publicKey: bytesToHex(publicKey),
    salt,
  });

  const falcon = createFalconWorkerClient();
  const sk = await getSecretKey(keypairId);
  if (!sk) throw new Error("No secret key available");
  const signature = await falcon.sign(meta.level, rawMessage, sk);
  sk.fill(0);
  falcon.terminate();

  const res = await PaymasterAPI.createNewAccount(
    sender,
    domain.name,
    bytesToHex(publicKey),
    salt,
    bytesToHex(signature),
  );

  return { success: res.success, paymaster: res.paymaster };
}

export async function notifyBundlerPublicKeyUpdate({
  folio,
  domain,
  newKeypairId,
}: {
  folio: Folio;
  domain: Domain;
  newKeypairId: string;
}): Promise<GenericResponse> {
  const newPK = await getPublicKey(newKeypairId);
  if (!newPK) throw new Error(`New keypair ${newKeypairId} not found`);

  const oldPK = await getPublicKey(folio.keypairId);
  if (!oldPK) throw new Error(`Old keypair ${folio.keypairId} not found`);

  // Sign the new key bytes with the old secret key so bundler can verify authority
  const keypairs = await listKeypairs();
  const oldMeta = keypairs.find(k => k.id === folio.keypairId);
  if (!oldMeta || oldMeta.level === "ECC") throw new Error("Old keypair not found or ECC");

  const oldSK = await getSecretKey(folio.keypairId);
  if (!oldSK) throw new Error("Old secret key not available");

  // Build the same canonical message the bundler will verify against:
  // concat(senderBytes, domainBytes, oldKeyBytes, newKeyBytes)
  const encoder = new TextEncoder();
  const verifyMsg = new Uint8Array([
    ...hexToBytes(folio.address as `0x${string}`),
    ...encoder.encode(domain.name),
    ...oldPK,
    ...newPK,
  ]);

  const falcon = createFalconWorkerClient();
  const signature = await falcon.sign(oldMeta.level, verifyMsg, oldSK);
  oldSK.fill(0);
  falcon.terminate();

  return BundlerAPI.updatePublicKey(
    folio.address as Address,
    domain.name,
    bytesToHex(oldPK),
    bytesToHex(newPK),
    bytesToHex(signature),
  );
}
