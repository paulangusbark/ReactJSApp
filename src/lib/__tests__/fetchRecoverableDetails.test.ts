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
const GUARDIAN_1 = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC" as `0x${string}`;
const GUARDIAN_2 = "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" as `0x${string}`;

const OPTS = { accountAddress: ACCOUNT, rpcUrl: "http://localhost:8545", entryPoint: ENTRY_POINT, keypairLevel: 512 as const };

// Helper: mock readContract to return addresses from getRecoverables, and default
// threshold/participants for per-entry getter calls.
function makeReadMock(recoverableAddresses: `0x${string}`[], threshold = 2n, participants = [GUARDIAN_1, GUARDIAN_2]) {
  mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === "getRecoverables") return Promise.resolve(recoverableAddresses);
    if (functionName === "getThreshold") return Promise.resolve(threshold);
    if (functionName === "getListOfAddresses") return Promise.resolve(participants);
    return Promise.reject(new Error(`Unexpected readContract call: ${functionName}`));
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("fetchRecoverableDetails", () => {
  it("returns empty array when getRecoverables returns []", async () => {
    mockReadContract.mockResolvedValue([]);
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toEqual([]);
    expect(mockSimulateContract).not.toHaveBeenCalled();
  });

  it("returns isActive true when disableRecoverable simulation succeeds", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toHaveLength(1);
    expect(result[0].recoverableAddress).toBe(REC_A);
    expect(result[0].isActive).toBe(true);
  });

  it("returns isActive false when disableRecoverable simulation throws (already disabled)", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockRejectedValue(new Error("Recoverable already disabled"));
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].isActive).toBe(false);
  });

  it("returns threshold and participants from recoverable contract getters", async () => {
    makeReadMock([REC_A], 2n, [GUARDIAN_1, GUARDIAN_2]);
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].threshold).toBe(2);
    expect(result[0].participants).toEqual([GUARDIAN_1, GUARDIAN_2]);
  });

  it("calls getThreshold and getListOfAddresses on the recoverable address (not account)", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    await fetchRecoverableDetails(OPTS);
    const thresholdCall = mockReadContract.mock.calls.find(
      ([args]: [{ address: string; functionName: string }]) => args.functionName === "getThreshold"
    );
    expect(thresholdCall?.[0].address).toBe(REC_A);
    const listCall = mockReadContract.mock.calls.find(
      ([args]: [{ address: string; functionName: string }]) => args.functionName === "getListOfAddresses"
    );
    expect(listCall?.[0].address).toBe(REC_A);
  });

  it("handles multiple recoverables with correct per-entry status", async () => {
    makeReadMock([REC_A, REC_B]);
    mockSimulateContract
      .mockResolvedValueOnce({ result: true })   // REC_A active
      .mockRejectedValueOnce(new Error("Recoverable already disabled"));  // REC_B disabled
    const result = await fetchRecoverableDetails(OPTS);
    expect(result).toHaveLength(2);
    expect(result[0].recoverableAddress).toBe(REC_A);
    expect(result[0].isActive).toBe(true);
    expect(result[1].recoverableAddress).toBe(REC_B);
    expect(result[1].isActive).toBe(false);
  });

  it("treats any simulation error as inactive", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockRejectedValue(new Error("some unexpected RPC error"));
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].isActive).toBe(false);
  });

  it("passes entryPoint as account to simulateContract", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    await fetchRecoverableDetails(OPTS);
    expect(mockSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ account: ENTRY_POINT })
    );
  });

  it("works the same for keypairLevel 1024", async () => {
    makeReadMock([REC_A]);
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails({ ...OPTS, keypairLevel: 1024 });
    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(true);
    expect(mockSimulateContract).toHaveBeenCalledTimes(1);
  });

  it("falls back to threshold 0 if getThreshold throws (old contract)", async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "getRecoverables") return Promise.resolve([REC_A]);
      if (functionName === "getThreshold") return Promise.reject(new Error("function not found"));
      if (functionName === "getListOfAddresses") return Promise.resolve([GUARDIAN_1]);
      return Promise.reject(new Error(`Unexpected: ${functionName}`));
    });
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].threshold).toBe(0);
    expect(result[0].participants).toEqual([GUARDIAN_1]);
  });

  it("falls back to empty participants if getListOfAddresses throws (old contract)", async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "getRecoverables") return Promise.resolve([REC_A]);
      if (functionName === "getThreshold") return Promise.resolve(1n);
      if (functionName === "getListOfAddresses") return Promise.reject(new Error("function not found"));
      return Promise.reject(new Error(`Unexpected: ${functionName}`));
    });
    mockSimulateContract.mockResolvedValue({ result: true });
    const result = await fetchRecoverableDetails(OPTS);
    expect(result[0].threshold).toBe(1);
    expect(result[0].participants).toEqual([]);
  });
});
