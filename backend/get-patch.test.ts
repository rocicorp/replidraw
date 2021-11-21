import { expect } from "chai";
import { setup, test } from "mocha";
import { PatchOperation } from "replicache";
import { Cookie } from "schemas/poke";
import { createDatabase, putEntry, delEntry } from "./data";
import { withExecutor } from "./db";
import { getPatch } from "./get-patch";

setup(async () => {
  await withExecutor(async () => {
    await createDatabase();
  });
});

test("getPatch", async () => {
  await withExecutor(async (executor) => {
    type Case = {
      puts?: { key: string; roomID: string; value: number; version: number }[];
      dels?: { key: string; roomID: string; version: number }[];
      roomID: string;
      fromCookie: Cookie;
      expected: PatchOperation[];
    };

    const cases: Case[] = [
      // Add item "a" and test it comes out with null sync
      {
        puts: [{ key: "a", roomID: "d1", value: 1, version: 2 }],
        fromCookie: null,
        roomID: "d1",
        expected: [
          {
            op: "put",
            key: "a",
            value: 1,
          },
        ],
      },
      // ... and incremental sync
      {
        fromCookie: 1,
        roomID: "d1",
        expected: [
          {
            op: "put",
            key: "a",
            value: 1,
          },
        ],
      },
      // ... but doesn't come back incrementally syncing from a later cookie
      {
        fromCookie: 2,
        roomID: "d1",
        expected: [],
      },
      // add item "b" and test both a and b come back for null sync
      {
        puts: [{ key: "b", roomID: "d1", value: 2, version: 3 }],
        roomID: "d1",
        fromCookie: null,
        expected: [
          {
            op: "put",
            key: "a",
            value: 1,
          },
          {
            op: "put",
            key: "b",
            value: 2,
          },
        ],
      },
      // ... but only b comes back when incrementally syncing after a
      {
        puts: [],
        roomID: "d1",
        fromCookie: 2,
        expected: [
          {
            op: "put",
            key: "b",
            value: 2,
          },
        ],
      },
      // set the cookie past both items
      {
        puts: [],
        roomID: "d1",
        fromCookie: 3,
        expected: [],
      },
      // even more past
      {
        puts: [],
        roomID: "d1",
        fromCookie: 4,
        expected: [],
      },
      // delete item a
      {
        dels: [{ key: "a", roomID: "d1", version: 4 }],
        roomID: "d1",
        fromCookie: 3,
        expected: [
          {
            op: "del",
            key: "a",
          },
        ],
      },
      {
        fromCookie: 4,
        roomID: "d1",
        expected: [],
      },
      // add something in another doc, no affect
      {
        puts: [
          {
            key: "a",
            roomID: "d2",
            value: 42,
            version: 5,
          },
        ],
        roomID: "d1",
        fromCookie: 4,
        expected: [],
      },
    ];

    for (const c of cases) {
      for (const p of c.puts || []) {
        await putEntry(executor, p.roomID, p.key, p.value, p.version);
        delEntry;
      }
      for (const d of c.dels || []) {
        await delEntry(executor, d.roomID, d.key, d.version);
      }
      const patch = await getPatch(executor, c.roomID, c.fromCookie);
      expect(patch).to.deep.equal(c.expected);
    }
  });
});
