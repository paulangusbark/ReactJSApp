import { describe, it, expect } from "vitest";
import { sortContacts } from "../contactSorting";
import type { Contact } from "@/storage/contactStore";

function contact(name: string, surname: string | undefined, createdAt: number): Contact {
  return { id: name, name, surname, createdAt, updatedAt: createdAt } as unknown as Contact;
}

const ALICE   = contact("Alice",   "Smith",   100);
const BOB     = contact("Bob",     "Jones",   200);
const CHARLIE = contact("Charlie", undefined, 50);

describe("sortContacts", () => {
  it("nameAsc — alphabetical ascending by first name", () => {
    const r = sortContacts([BOB, CHARLIE, ALICE], "nameAsc");
    expect(r.map(c => c.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("nameDesc — alphabetical descending by first name", () => {
    const r = sortContacts([ALICE, BOB, CHARLIE], "nameDesc");
    expect(r.map(c => c.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("createdAsc — oldest first", () => {
    const r = sortContacts([ALICE, BOB, CHARLIE], "createdAsc");
    expect(r.map(c => c.createdAt)).toEqual([50, 100, 200]);
  });

  it("createdDesc — newest first", () => {
    const r = sortContacts([ALICE, BOB, CHARLIE], "createdDesc");
    expect(r.map(c => c.createdAt)).toEqual([200, 100, 50]);
  });

  it("surnameAsc — alphabetical ascending by surname (undefined sorts first)", () => {
    const r = sortContacts([ALICE, BOB, CHARLIE], "surnameAsc");
    // undefined → "" → sorts before "Jones" and "Smith"
    expect(r[0].name).toBe("Charlie");
    expect(r[1].name).toBe("Bob");   // Jones
    expect(r[2].name).toBe("Alice"); // Smith
  });

  it("surnameDesc — alphabetical descending by surname", () => {
    const r = sortContacts([BOB, ALICE, CHARLIE], "surnameDesc");
    expect(r[0].name).toBe("Alice"); // Smith
    expect(r[1].name).toBe("Bob");   // Jones
  });

  it("does not mutate the input array", () => {
    const input = [BOB, ALICE, CHARLIE];
    sortContacts(input, "nameAsc");
    expect(input[0].name).toBe("Bob");
  });

  it("empty array returns empty array", () => {
    expect(sortContacts([], "nameAsc")).toEqual([]);
  });

  it("single element returns same element", () => {
    expect(sortContacts([ALICE], "nameAsc")).toEqual([ALICE]);
  });

  it("default mode is createdAsc", () => {
    const r = sortContacts([ALICE, BOB, CHARLIE]);
    expect(r.map(c => c.createdAt)).toEqual([50, 100, 200]);
  });
});
