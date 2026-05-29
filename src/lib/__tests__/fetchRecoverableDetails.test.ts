// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock viem — intercept createPublicClient so we control readContract / simulateContract
// ---------------------------------------------------------------------------

const mockReadContract = vi.fn();
const mockSimulateContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      simulateContract: mockSimulateContract,
    })),
  };
});

import { fetchRecoverableDetails } from "../fetchRecoverableDetails";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const ENTRY_POINT = "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE" as `0x${string}`;
const REC_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as `0x${string}`;
const REC_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as `0x${string}`;

const OPTS = { accountAddress: ACCOUNT, rpcUrl: "http://localhost:8545", entryPoint: ENTRY_POINT, keypairLevel: 512 as const };

beforeEach(() => { vi.clearAllMocks(); });

describe("fetchRecoverableDetails", () => {
  it("returns empty array when getRecoverables returns []", async () => {
    mockReadContract.mockResolvedValue([]);
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toEqual([]);
    expect(mockSimulateContract).not.toHaveBeenCalled();
  });

  it("returns isActive true when disableRecoverable simulation succeeds", async () => {
    mockReadContract.mockResolvedValue([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toHaveLength(1);
    expect(result[0].recoverableAddress).toBe(REC_A);
    expect(result[0].isActive).toBe(true);
  });

  it("returns isActive false when disableRecoverable simulation throws (already disabled)", async () => {
    mockReadContract.mockResolvedValue([REC_A]);
    mockSimulateContract.mockRejectedValue(new Error("Recoverable already disabled"));
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].isActive).toBe(false);
  });

  it("handles multiple recoverables with correct per-entry status", async () => {
    mockReadContract.mockResolvedValue([REC_A, REC_B]);
    mockSimulateContract
      .mockResolvedValueOnce({ result: true })   // REC_A active
      .mockRejectedValueOnce(new Error("Recoverable already disabled"));  // REC_B disabled
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ recoverableAddress: REC_A, isActive: true });
    expect(result[1]).toEqual({ recoverableAddress: REC_B, isActive: false });
  });

  it("treats any simulation error as inactive", async () => {
    mockReadContract.mockResolvedValue([REC_A]);
    mockSimulateContract.mockRejectedValue(new Error("some unexpected RPC error"));
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].isActive).toBe(false);
  });

  it("passes entryPoint as account to simulateContract", async () => {
    mockReadContract.mockResolvedValue([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    await fetchRecoverableDetails(OPTS);
    expect(mockSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ account: ENTRY_POINT })
    );
  });

  it("works the same for keypairLevel 1024", async () => {
    mockReadContract.mockResolvedValue([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails({ ...OPTS, keypairLevel: 1024 });
    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(true);
    expect(mockSimulateContract).toHaveBeenCalledTimes(1);
  });
});
