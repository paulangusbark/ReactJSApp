import type { FalconLevel } from "@/storage/keyStore";

export type GasProfile = {
  verificationGasLimit: bigint;
  keyRotationCallGasLimit: bigint;
  defaultCallGasFallback: bigint;
};

const GAS_BY_LEVEL: Record<512 | 1024, GasProfile> = {
  512: {
    verificationGasLimit:    5_000_000n,
    keyRotationCallGasLimit: 1_200_000n,
    defaultCallGasFallback:  500_000n,
  },
  1024: {
    verificationGasLimit:    15_000_000n,
    keyRotationCallGasLimit: 2_800_000n,
    defaultCallGasFallback:  500_000n,
  },
};

export function getGasProfile(level: FalconLevel): GasProfile {
  if (level === "ECC") throw new Error("ECC accounts not yet supported for gas profiling");
  return GAS_BY_LEVEL[level];
}
