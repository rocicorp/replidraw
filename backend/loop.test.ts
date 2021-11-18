import { expect } from "chai";
import { test } from "mocha";
import { WriteTransaction } from "replicache";
import { Mutation } from "../schemas/push";
import { JSONType } from "../schemas/json";
import { PokeResponse } from "../schemas/poke";
import { ClientRecord, createDatabase } from "./data";
import { transact } from "./db";
import { EntryCache } from "./entry-cache";
import {
  clearPending,
  ClientMutation,
  getPendingMutationsByRoom,
  RoomID,
  stepMutation,
} from "./loop";
import { PostgresStorage } from "./postgres-storage";
import { Client, ClientID, ClientMap } from "./server";

/*
test("stepRoomSortOrder", async () => {
  // run mutation in order of timestamp
  // increment lmid of cr appropriately
  // actually make changes
  // return pokes
  await createDatabase();

  type Case = {
    name: string;
    mutations: ClientMutation[];
    expected: [ClientID, number][];
    expectedLMID: Record<ClientID, number>;
    expectedPokes: Record<ClientID, PokeResponse>;
  };

  const cases = [
    {
      name: "empty",
      mutations: [],
      expected: [],
      expectedLMID: {},
      expecctedPokes: {},
    },
    {
      name: "one",
      mutations: [
        {
          clientID: "a",
          id: 1,
          name: "m",
          args: null,
          timestamp: 42,
        },
      ],
      expected: [["a", 1]],
      expectedLMID: { a: 1 },
      expectedPokes: {

      },
    },
    {
      name: "one client two mutations",
      mutations: [
        {
          clientID: "a",
          id: 2,
          name: "m",
          args: null,
          timestamp: 42,
        },
        {
          clientID: "a",
          id: 1,
          name: "m",
          args: null,
          timestamp: 41,
        },
      ],
      expected: [
        ["a", 1],
        ["a", 2],
      ],
    },
  ];
});
*/

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
      expectReturn: false,
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

      const retVal = await stepMutation(entryCache, mutation, cr, mutators);
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
