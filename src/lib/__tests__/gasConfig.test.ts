import { describe, it, expect } from "vitest";
import { getGasProfile } from "../gasConfig";

describe("getGasProfile", () => {
  it("returns correct values for Falcon-512", () => {
    const p = getGasProfile(512);
    expect(p.verificationGasLimit).toBe(5_000_000n);
    expect(p.keyRotationCallGasLimit).toBe(1_200_000n);
    expect(p.defaultCallGasFallback).toBe(500_000n);
  });

  it("returns correct values for Falcon-1024", () => {
    const p = getGasProfile(1024);
    expect(p.verificationGasLimit).toBe(15_000_000n);
    expect(p.keyRotationCallGasLimit).toBe(2_800_000n);
    expect(p.defaultCallGasFallback).toBe(500_000n);
  });

  it("throws for ECC", () => {
    expect(() => getGasProfile("ECC")).toThrow("ECC accounts not yet supported");
  });
});
