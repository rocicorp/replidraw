import { expect } from "chai";
import { setup, test } from "mocha";
import { PatchOperation } from "replicache";
import { Cookie } from "schemas/poke";
import { createDatabase, putObject, delObject } from "./data";
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
      puts?: { key: string; docID: string; value: number; version: number }[];
      dels?: { key: string; docID: string; version: number }[];
      docID: string;
      fromCookie: Cookie;
      expected: PatchOperation[];
    };

    const cases: Case[] = [
      // Add item "a" and test it comes out with null sync
      {
        puts: [{ key: "a", docID: "d1", value: 1, version: 2 }],
        fromCookie: null,
        docID: "d1",
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
        docID: "d1",
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
        docID: "d1",
        expected: [],
      },
      // add item "b" and test both a and b come back for null sync
      {
        puts: [{ key: "b", docID: "d1", value: 2, version: 3 }],
        docID: "d1",
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
        docID: "d1",
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
        docID: "d1",
        fromCookie: 3,
        expected: [],
      },
      // even more past
      {
        puts: [],
        docID: "d1",
        fromCookie: 4,
        expected: [],
      },
      // delete item a
      {
        dels: [{ key: "a", docID: "d1", version: 4 }],
        docID: "d1",
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
        docID: "d1",
        expected: [],
      },
      // add something in another doc, no affect
      {
        puts: [
          {
            key: "a",
            docID: "d2",
            value: 42,
            version: 5,
          },
        ],
        docID: "d1",
        fromCookie: 4,
        expected: [],
      },
    ];

    for (const c of cases) {
      for (const p of c.puts || []) {
        await putObject(executor, p.docID, p.key, p.value, p.version);
      }
      for (const d of c.dels || []) {
        await delObject(executor, d.docID, d.key, d.version);
      }
      const patch = await getPatch(executor, c.docID, c.fromCookie);
      expect(patch).to.deep.equal(c.expected);
    }
  });
});
