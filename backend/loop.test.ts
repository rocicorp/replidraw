import { expect } from "chai";
import { test } from "mocha";
import { WriteTransaction } from "replicache";
import { Mutation } from "../schemas/push";
import { JSONType } from "../schemas/json";
import { Cookie, PokeResponse } from "../schemas/poke";
import {
  ClientRecord,
  createDatabase,
  getCookie,
  getObject,
  mustGetClientRecord,
  mustGetClientRecords,
  setClientRecord,
} from "./data";
import { transact } from "./db";
import { EntryCache } from "./entry-cache";
import {
  clearPending,
  ClientMutation,
  getPendingMutationsByRoom,
  RoomID,
  stepMutation,
  stepRoom,
} from "./loop";
import { PostgresStorage } from "./postgres-storage";
import { Client, ClientID, ClientMap } from "./server";
import { ClientPokeResponse } from "./poke";

test("stepRoom", async () => {
  // stepRoom must:
  // - sort input mutations by timestamp
  // - no-op mutations that have already been processed
  // - skip mutations from the future
  // - write changes to passed executor:
  //   - objects
  //   - clients (lmid, baseCookie)
  // - return appropriate pokes
  //
  // To test these properties we pass an unsorted list of mutations into
  // stepRoom with a varying clientIDs and timestamps. The corresponding
  // mutator does nothing but add a record to a log in a single key in the
  // cache.
  //
  // After stepRoom returns, we validate the pokes it returned and then
  // read the corresponding data out of the passed in executor and validate
  // it.

  type Case = {
    name: string;
    mutations: ClientMutation[];
    expectedLog: [ClientID, number][];
    expectedClientState: Record<
      ClientID,
      { baseCookie: Cookie; lastMutationID: number }
    >;
  };

  const mutation = (
    clientID: string,
    mutationID: number,
    timestamp: number
  ) => ({
    clientID,
    id: mutationID,
    name: "m",
    // We just pass the mutationID as the argument because all we're trying to do
    // is create a log of the mutations that ran.
    args: mutationID,
    timestamp,
  });

  const cases: Case[] = [
    {
      name: "none",
      mutations: [],
      expectedLog: [],
      expectedClientState: {},
    },
    {
      name: "one",
      mutations: [mutation("a", 1, 42)],
      expectedLog: [["a", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "one client two mutations",
      mutations: [mutation("a", 2, 42), mutation("a", 1, 41)],
      expectedLog: [
        ["a", 1],
        ["a", 2],
      ],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 2 },
      },
    },
    {
      name: "two clients two mutations",
      mutations: [mutation("a", 1, 42), mutation("b", 1, 41)],
      expectedLog: [
        ["b", 1],
        ["a", 1],
      ],
      expectedClientState: {
        b: { baseCookie: null, lastMutationID: 1 },
        a: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "two clients one stalled",
      // b cannot run because next mutation id for him is 1
      mutations: [mutation("a", 1, 42), mutation("b", 2, 41)],
      expectedLog: [["a", 1]],
      expectedClientState: {
        b: { baseCookie: null, lastMutationID: 0 },
        a: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "two clients, one duplicate",
      // a's mutation has already been processed
      mutations: [mutation("a", 0, 42), mutation("b", 1, 43)],
      expectedLog: [["b", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 0 },
        b: { baseCookie: null, lastMutationID: 1 },
      },
    },
  ];

  const roomID = "r1";
  const mutators = {
    m: async (tx: WriteTransaction, mutationID: number) => {
      const log = ((await tx.get("log")) ?? []) as [ClientID, number][];
      log.push([tx.clientID, mutationID]);
      await tx.put("log", log);
    },
  };

  for (const c of cases) {
    await transact(async (executor) => {
      await createDatabase();

      // Initialize clients before calling stepRoom().
      const distinctClientIDs = new Set(c.mutations.map((m) => m.clientID));
      for (const id of distinctClientIDs) {
        await setClientRecord(executor, {
          id,
          baseCookie: null,
          documentID: roomID,
          lastMutationID: 0,
        });
      }

      const res = await stepRoom(executor, roomID, c.mutations, mutators);

      // Compute the expected pokes.
      const roomCookie = await getCookie(executor, roomID);
      const expectedPokes: ClientPokeResponse[] = Object.entries(
        c.expectedClientState
      ).map(([clientID, state]) => ({
        clientID,
        poke: {
          baseCookie: state.baseCookie,
          cookie: roomCookie,
          lastMutationID: state.lastMutationID,
          patch: [
            {
              op: "put",
              key: "log",
              value: c.expectedLog,
            },
          ],
        },
      }));
      expect(res).to.deep.equal(expectedPokes, c.name);

      const log = (await getObject(executor, roomID, "log")) ?? [];
      expect(log).to.deep.equal(c.expectedLog, c.name);

      for (const [clientID, state] of Object.entries(c.expectedClientState)) {
        const cr = await mustGetClientRecord(executor, clientID);
        expect(cr.lastMutationID).to.equal(state.lastMutationID, c.name);
        expect(cr.baseCookie).to.equal(roomCookie, c.name);
      }
    });
  }
});

test("stepMutation", async () => {
  await createDatabase();

  type Case = {
    name: string;
    mutationID: number;
    expectReturn: boolean;
    expectChange: boolean;
    throws: boolean;
  };

  const cases: Case[] = [
    {
      name: "mutation already processed",
      mutationID: 42,
      expectReturn: true,
      expectChange: false,
      throws: false,
    },
    {
      name: "mutation out of order",
      mutationID: 44,
      expectReturn: false,
      expectChange: false,
      throws: false,
    },
    {
      name: "mutation throws",
      mutationID: 43,
      expectReturn: true,
      expectChange: false,
      throws: true,
    },
    {
      name: "mutation suceeds",
      mutationID: 43,
      expectReturn: true,
      expectChange: true,
      throws: false,
    },
  ];

  for (const [i, c] of cases.entries()) {
    await transact(async (executor) => {
      const storage = new PostgresStorage(executor, "test");
      const entryCache = new EntryCache(storage);
      const mutation: ClientMutation = {
        clientID: "c1",
        id: c.mutationID,
        name: "a",
        args: i,
        timestamp: 0,
      };
      const cr: ClientRecord = {
        baseCookie: null,
        documentID: "test",
        id: "c1",
        lastMutationID: 42,
      };
      const mutators = {
        a: (tx: WriteTransaction, args: JSONType) => {
          if (c.throws) {
            throw new Error("bonk");
          }
          tx.put("k", args);
        },
      };

      const retVal = await stepMutation(
        entryCache,
        mutation,
        cr.lastMutationID,
        mutators
      );
      const changedVal = await entryCache.get("k");
      expect(retVal).to.equal(c.expectReturn, c.name);
      expect(changedVal).to.equal(c.expectChange ? i : undefined, c.name);
    });
  }
});

test("getPendingMutationsByRoom", () => {
  type Case = {
    name: string;
    clients: ClientMap;
    expected: Map<RoomID, ClientMutation[]>;
  };
  const cases: Case[] = [
    {
      name: "empty",
      clients: clientMap(),
      expected: new Map(),
    },
    {
      name: "one client, no mutations",
      clients: clientMap(client("c1", "r1", 0)),
      expected: new Map(),
    },
    {
      name: "two clients, no mutations",
      clients: clientMap(client("c1", "r1", 0), client("c2", "r2", 0)),
      expected: new Map(),
    },
    {
      name: "one client, one mutation",
      clients: clientMap(client("c1", "r1", 1)),
      expected: new Map([["r1", [clientMutation(0, "c1")]]]),
    },
    {
      name: "two clients, two mutations, one room",
      clients: clientMap(client("c1", "r1", 1), client("c2", "r1", 1)),
      expected: new Map([
        ["r1", [clientMutation(0, "c1"), clientMutation(0, "c2")]],
      ]),
    },
    {
      name: "two clients, three mutations, two room",
      clients: clientMap(
        client("c1", "r1", 1),
        client("c2", "r1", 1),
        client("c3", "r2", 1)
      ),
      expected: new Map([
        ["r1", [clientMutation(0, "c1"), clientMutation(0, "c2")]],
        ["r2", [clientMutation(0, "c3")]],
      ]),
    },
    {
      name: "two clients, four mutations, one room",
      clients: clientMap(client("c1", "r1", 2), client("c2", "r1", 2)),
      expected: new Map([
        [
          "r1",
          [
            clientMutation(0, "c1"),
            clientMutation(1, "c1"),
            clientMutation(0, "c2"),
            clientMutation(1, "c2"),
          ],
        ],
      ]),
    },
  ];
  for (const c of cases) {
    const res = getPendingMutationsByRoom(c.clients);
    expect(res).to.deep.equal(c.expected, c.name);
  }
});

test("clearPending", () => {
  type Case = {
    name: string;
    pending: Mutation[];
    lmid: number;
    expected: Mutation[];
  };
  const cases: Case[] = [
    {
      name: "empty",
      pending: [],
      lmid: 1,
      expected: [],
    },
    {
      name: "remove only item",
      pending: [mutation(1)],
      lmid: 1,
      expected: [],
    },
    {
      name: "remove first item",
      pending: [mutation(1), mutation(2)],
      lmid: 1,
      expected: [mutation(2)],
    },
    {
      name: "remove both items",
      pending: [mutation(1), mutation(2)],
      lmid: 2,
      expected: [],
    },
    {
      name: "remove no items",
      pending: [mutation(1), mutation(2)],
      lmid: 0,
      expected: [mutation(1), mutation(2)],
    },
    {
      name: "large lmid",
      pending: [mutation(1), mutation(2)],
      lmid: 7,
      expected: [],
    },
    {
      name: "too small lmid",
      pending: [mutation(4), mutation(5)],
      lmid: 2,
      expected: [mutation(4), mutation(5)],
    },
    {
      name: "hole",
      pending: [mutation(1), mutation(5)],
      lmid: 3,
      expected: [mutation(5)],
    },
  ];

  for (const c of cases) {
    const pending = c.pending.slice();
    clearPending(pending, c.lmid);
    expect(pending).to.deep.equal(c.expected, c.name);
  }
});

function clientMap(...clients: Client[]): ClientMap {
  const res = new Map<string, Client>();
  for (const c of clients) {
    res.set(c.clientID, c);
  }
  return res;
}

function client(id: string, roomID: string, numPending = 0): Client {
  return {
    clientID: id,
    roomID,
    pending: new Array(numPending).fill(0).map((_, i) => mutation(i)),
    socket: new MockSocket(),
  };
}

function clientMutation(id: number, clientID: string): ClientMutation {
  return {
    clientID,
    timestamp: undefined,
    ...mutation(id),
  } as ClientMutation;
}

function mutation(id: number): Mutation {
  return {
    id,
    name: "a",
    args: {},
  };
}

class MockSocket {
  messages: string[] = [];
  send(data: string) {
    this.messages.push(data);
  }
  close() {}
}
