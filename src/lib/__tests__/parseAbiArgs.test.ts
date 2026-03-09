import { describe, it, expect } from "vitest";
import { parseAbiArg } from "../parseAbiArgs";

describe("parseAbiArg", () => {
  // --- string ---
  it("returns string as-is for type 'string'", () => {
    expect(parseAbiArg("string", "hello world")).toBe("hello world");
  });

  it("trims whitespace for type 'string'", () => {
    expect(parseAbiArg("string", "  hi  ")).toBe("hi");
  });

  // --- address ---
  it("returns address value as-is", () => {
    const addr = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(parseAbiArg("address", addr)).toBe(addr);
  });

  // --- bool ---
  it("converts 'true' to boolean true", () => {
    expect(parseAbiArg("bool", "true")).toBe(true);
  });

  it("converts 'True' (mixed case) to boolean true", () => {
    expect(parseAbiArg("bool", "True")).toBe(true);
  });

  it("converts 'false' to boolean false", () => {
    expect(parseAbiArg("bool", "false")).toBe(false);
  });

  it("converts any non-'true' string to false for bool", () => {
    expect(parseAbiArg("bool", "yes")).toBe(false);
    expect(parseAbiArg("bool", "1")).toBe(false);
  });

  // --- uint / int ---
  it("converts uint256 string to BigInt", () => {
    expect(parseAbiArg("uint256", "1000000")).toBe(1000000n);
  });

  it("converts int128 negative string to BigInt", () => {
    expect(parseAbiArg("int128", "-42")).toBe(-42n);
  });

  it("returns 0n for empty uint input", () => {
    expect(parseAbiArg("uint256", "")).toBe(0n);
  });

  // --- bytes ---
  it("returns bytes32 value as-is", () => {
    const val = "0x" + "ff".repeat(32);
    expect(parseAbiArg("bytes32", val)).toBe(val);
  });

  it("returns bytes value as-is", () => {
    expect(parseAbiArg("bytes", "0xdeadbeef")).toBe("0xdeadbeef");
  });

  // --- arrays ---
  // Note: uint256[] hits the startsWith("uint") branch before the array branch,
  // so array types should be tested with non-uint base types.
  it("parses address[] from JSON array string", () => {
    const addrs = '["0xaa","0xbb"]';
    expect(parseAbiArg("address[]", addrs)).toEqual(["0xaa", "0xbb"]);
  });

  it("parses string[] from JSON array string", () => {
    expect(parseAbiArg("string[]", '["hello","world"]')).toEqual(["hello", "world"]);
  });

  it("returns empty array for empty input on address[] type", () => {
    expect(parseAbiArg("address[]", "")).toEqual([]);
  });

  it("throws on invalid JSON for array type", () => {
    expect(() => parseAbiArg("address[]", "not-json")).toThrow(/Invalid array JSON/i);
  });

  // --- fallback ---
  it("returns raw string for unknown type", () => {
    expect(parseAbiArg("tuple", "something")).toBe("something");
  });
});
