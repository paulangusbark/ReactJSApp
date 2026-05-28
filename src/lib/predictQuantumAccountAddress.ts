import {
  Hex,
  Address,
  keccak256,
  concatHex,
  pad,
} from "viem";

/**
 * Precompute the CREATE2 address for a QuantumAccount.
 *
 * initCodeHash = keccak256(creationCode ++ abi.encode(recoverableFactory))
 * Use GenerateInitCodeHash.s.sol to produce the correct value for a given factory.
 */
export function predictQuantumAccountAddress(params: {
  factory: Address;
  salt: Hex; // 32-byte hex
  initCodeHash: Hex; // keccak256(creationCode ++ abi.encode(recoverableFactory))
}): Address {
  const { factory, salt, initCodeHash } = params;

  const salt32 = pad(salt, { size: 32 });

  const data = concatHex([
    "0xff",
    factory,
    salt32,
    initCodeHash,
  ]);

  const hash = keccak256(data);

  // Take the last 20 bytes → Ethereum address
  const address = ("0x" + hash.slice(26)) as Address;
  return address;
}
