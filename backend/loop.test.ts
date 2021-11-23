import { expect } from "chai";
import { test } from "mocha";
import { WriteTransaction } from "replicache";
import { Mutation } from "../schemas/push";
import { JSONType } from "../schemas/json";
import { Cookie } from "../schemas/poke";
import {
  ClientRecord,
  createDatabase,
  getRoomVersion,
  getEntry,
  mustGetClientRecord,
  setClientRecord,
} from "./data";
import { transact } from "./db";
import { EntryCache } from "./entry-cache";
import {
  clearPending,
  ClientMutation,
  getPendingMutationsByRoom,
  Loop,
  RoomID,
  step,
  stepMutation,
  stepRoom,
} from "./loop";
import { DBStorage } from "./db-storage";
import { Client, ClientID, ClientMap } from "./server";
import { ClientPokeResponse } from "./poke";
import { Response } from "schemas/network";

test("loop", async () => {
  type Case = {
    name: string;
    numRuns: number;
    nowVals: number[];
    expectedSleepCalls: number[];
  };

  const cases: Case[] = [
    {
      name: "one",
      numRuns: 1,
      nowVals: [0, 10],
      expectedSleepCalls: [],
    },
    {
      name: "two",
      numRuns: 2,
      nowVals: [0, 10, 100, 200],
      expectedSleepCalls: [90],
    },
    {
      name: "three",
      numRuns: 3,
      // We only run the loop twice because the second two calls get debounced
      nowVals: [0, 10, 100, 200],
      expectedSleepCalls: [90],
    },
    {
      name: "seven",
      numRuns: 7,
      // We only run the loop twice because the second-seventh calls get debounced
      nowVals: [0, 10, 100, 200],
      expectedSleepCalls: [90],
    },
    {
      name: "overflow",
      numRuns: 2,
      nowVals: [0, 200, 300, 300],
      // should clamp to zero
      expectedSleepCalls: [0],
    },
  ];

  for (const c of cases) {
    const step = async () => {};

    const now = () => {
      expect(c.nowVals.length).to.be.greaterThan(0, c.name);
      return c.nowVals.shift()!;
    };

    const sleepCalls: number[] = [];
    const sleep = (ms: number) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const loop = new Loop(step, now, sleep, 100);
    await Promise.all(new Array(c.numRuns).fill(0).map(() => loop.run()));

    expect(c.nowVals).to.deep.equal([], c.name);
    expect(sleepCalls).to.deep.equal(c.expectedSleepCalls, c.name);
  }
});

test("step", async () => {
  // step must:
  // - gather pending mutations from clients and group by room
  // - step each room
  // - commit changes to db
  // - clear pending mutations on clients
  // - send pokes
  type Case = {
    name: string;
    clientRecords: ClientRecord[];
    clients: ClientMap;
    expectedRecords: ClientRecord[];
    expectedPending: Map<ClientID, ClientMutation[]>;
    expectedPokes: ClientPokeResponse[];
  };

  const cases: Case[] = [
    {
      name: "no clients",
      clientRecords: [],
      clients: new Map(),
      expectedRecords: [],
      expectedPending: new Map(),
      expectedPokes: [],
    },
    {
      name: "no clients with pending",
      clientRecords: [],
      clients: clientMap(client("a", "r1", 0), client("b", "r1", 0)),
      expectedRecords: [],
      expectedPending: new Map(),
      expectedPokes: [],
    },
    {
      name: "one pending",
      clientRecords: [clientRecord("a", "r1", null, 0)],
      clients: clientMap(client("a", "r1", 1)),
      expectedRecords: [clientRecord("a", "r1", 1, 1)],
      expectedPending: new Map([["a", []]]),
      expectedPokes: [clientPoke("a", null, 1, 1, [["a", 1]])],
    },
    {
      name: "two pending, one room",
      clientRecords: [
        clientRecord("a", "r1", null, 0),
        clientRecord("b", "r1", null, 0),
      ],
      clients: clientMap(client("a", "r1", 1), client("b", "r1", 1)),
      expectedRecords: [
        // cookie is 1 because both mutations affect same key, so we only write to postgres once
        clientRecord("a", "r1", 1, 1),
        clientRecord("b", "r1", 1, 1),
      ],
      expectedPending: new Map([
        ["a", []],
        ["b", []],
      ]),
      expectedPokes: [
        clientPoke("a", null, 1, 1, [
          ["a", 1],
          ["b", 1],
        ]),
        clientPoke("b", null, 1, 1, [
          ["a", 1],
          ["b", 1],
        ]),
      ],
    },
    {
      name: "two pending, two rooms",
      clientRecords: [
        clientRecord("a", "r1", null, 0),
        clientRecord("b", "r2", null, 0),
      ],
      clients: clientMap(client("a", "r1", 1), client("b", "r2", 1)),
      expectedRecords: [
        clientRecord("a", "r1", 1, 1),
        clientRecord("b", "r2", 1, 1),
      ],
      expectedPending: new Map([
        ["a", []],
        ["b", []],
      ]),
      expectedPokes: [
        clientPoke("a", null, 1, 1, [["a", 1]]),
        clientPoke("b", null, 1, 1, [["b", 1]]),
      ],
    },
  ];

  for (const c of cases) {
    await createDatabase();
    await transact(async (tx) => {
      Promise.all(c.clientRecords.map((r) => setClientRecord(tx, r)));
    });

    await step(c.clients, loggingMutators);

    await transact(async (tx) => {
      for (const expected of c.expectedRecords) {
        const actual = await mustGetClientRecord(tx, expected.id);
        expect(actual).to.deep.equal(expected, c.name);
      }
    });

    for (const [clientID, expected] of c.expectedPending) {
      const actual = c.clients.get(clientID)!.pending;
      expect(actual).to.deep.equal(expected, c.name);
    }

    for (const expected of c.expectedPokes) {
      const actual = (c.clients.get(expected.clientID)!.socket as MockSocket)
        .messages;
      const exp: Response = ["poke", expected.poke];
      expect(actual).to.deep.equal([JSON.stringify(exp)], c.name);
    }
  }
});

test("stepRoom", async () => {
  // stepRoom must:
  // - sort input mutations by timestamp
  // - no-op mutations that have already been processed
  // - skip mutations from the future
  // - write changes to passed executor:
  //   - entries
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

  const cases: Case[] = [
    {
      name: "none",
      mutations: [],
      expectedLog: [],
      expectedClientState: {},
    },
    {
      name: "one",
      mutations: [clientMutation(1, "a", 42)],
      expectedLog: [["a", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "one client two mutations",
      mutations: [clientMutation(2, "a", 42), clientMutation(1, "a", 41)],
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
      mutations: [clientMutation(1, "a", 42), clientMutation(1, "b", 41)],
      expectedLog: [
        ["b", 1],
        ["a", 1],
      ],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 1 },
        b: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "two clients one stalled",
      // b cannot run because next mutation id for him is 1
      mutations: [clientMutation(1, "a", 42), clientMutation(2, "b", 41)],
      expectedLog: [["a", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 1 },
        b: { baseCookie: null, lastMutationID: 0 },
      },
    },
    {
      name: "two clients, one duplicate",
      // a's mutation has already been processed
      mutations: [clientMutation(0, "a", 42), clientMutation(1, "b", 43)],
      expectedLog: [["b", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 0 },
        b: { baseCookie: null, lastMutationID: 1 },
      },
    },
    {
      name: "one clients, two duplicates",
      // a's first two mutations have already been processed
      mutations: [
        clientMutation(-1, "a", 41),
        clientMutation(0, "a", 42),
        clientMutation(1, "a", 43),
      ],
      expectedLog: [["a", 1]],
      expectedClientState: {
        a: { baseCookie: null, lastMutationID: 1 },
      },
    },
  ];

  const roomID = "r1";

  for (const c of cases) {
    await transact(async (executor) => {
      await createDatabase();

      // Initialize clients before calling stepRoom().
      const distinctClientIDs = new Set(c.mutations.map((m) => m.clientID));
      for (const id of distinctClientIDs) {
        await setClientRecord(executor, {
          id,
          baseCookie: null,
          roomID,
          lastMutationID: 0,
        });
      }

      const res = await stepRoom(
        executor,
        roomID,
        c.mutations,
        loggingMutators,
        [...distinctClientIDs]
      );

      // Compute the expected pokes.
      const roomCookie = await getRoomVersion(executor, roomID);
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

      const entry = await getEntry(executor, roomID, "log");
      const log = entry.value ?? [];
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
    expectUpdateLMID: boolean;
    expectChange: boolean;
    mutationThrows: boolean;
    mutatorMissing: boolean;
    clientRecordMissing: boolean;
  };

  const cases: Case[] = [
    {
      name: "mutation already processed",
      mutationID: 42,
      expectUpdateLMID: false,
      expectChange: false,
      mutationThrows: false,
      mutatorMissing: false,
      clientRecordMissing: false,
    },
    {
      name: "mutation out of order",
      mutationID: 44,
      expectUpdateLMID: false,
      expectChange: false,
      mutationThrows: false,
      mutatorMissing: false,
      clientRecordMissing: false,
    },
    {
      name: "mutation throws",
      mutationID: 43,
      expectUpdateLMID: true,
      expectChange: false,
      mutationThrows: true,
      mutatorMissing: false,
      clientRecordMissing: false,
    },
    {
      name: "mutation suceeds",
      mutationID: 43,
      expectUpdateLMID: true,
      expectChange: true,
      mutationThrows: false,
      mutatorMissing: false,
      clientRecordMissing: false,
    },
    {
      name: "mutator missing",
      mutationID: 43,
      expectUpdateLMID: true,
      expectChange: false,
      mutationThrows: false,
      mutatorMissing: true,
      clientRecordMissing: false,
    },
    {
      name: "client record missing",
      mutationID: 43,
      expectUpdateLMID: false,
      expectChange: false,
      mutationThrows: false,
      mutatorMissing: false,
      clientRecordMissing: true,
    },
  ];

  for (const [i, c] of cases.entries()) {
    await transact(async (executor) => {
      const storage = new DBStorage(executor, "test");
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
        roomID: "test",
        id: "c1",
        lastMutationID: 42,
      };
      const mutators: Record<string, Function> = {
        a: (tx: WriteTransaction, args: JSONType) => {
          if (c.mutationThrows) {
            throw new Error("bonk");
          }
          tx.put("k", args);
        },
      };
      if (c.mutatorMissing) {
        delete mutators.a;
      }

      const clientRecords = new Map<ClientID, ClientRecord>();
      if (!c.clientRecordMissing) {
        clientRecords.set(cr.id, cr);
      }

      let err = null;
      try {
        await stepMutation(entryCache, mutation, 1, mutators, clientRecords);
      } catch (e) {
        err = e;
      }
      if (c.clientRecordMissing) {
        expect(String(err)).contains("ClientRecord not found for mutation: c1");
      } else {
        expect(err).null;
      }

      const { value: changedVal } = await entryCache.get("k");
      if (c.expectUpdateLMID) {
        expect(cr.lastMutationID).equal(c.mutationID);
      }
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
      expected: new Map([["r1", [clientMutation(1, "c1")]]]),
    },
    {
      name: "two clients, two mutations, one room",
      clients: clientMap(client("c1", "r1", 1), client("c2", "r1", 1)),
      expected: new Map([
        ["r1", [clientMutation(1, "c1"), clientMutation(1, "c2")]],
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
        ["r1", [clientMutation(1, "c1"), clientMutation(1, "c2")]],
        ["r2", [clientMutation(1, "c3")]],
      ]),
    },
    {
      name: "two clients, four mutations, one room",
      clients: clientMap(client("c1", "r1", 2), client("c2", "r1", 2)),
      expected: new Map([
        [
          "r1",
          [
            clientMutation(1, "c1"),
            clientMutation(2, "c1"),
            clientMutation(1, "c2"),
            clientMutation(2, "c2"),
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

const loggingMutators = {
  m: async (tx: WriteTransaction, mutationID: number) => {
    const log = ((await tx.get("log")) ?? []) as [ClientID, number][];
    log.push([tx.clientID, mutationID]);
    await tx.put("log", log);
  },
};

function clientPoke(
  clientID: string,
  baseCookie: Cookie,
  cookie: Cookie,
  lastMutationID: number,
  logValue: [ClientID, number][]
) {
  return {
    clientID,
    poke: {
      baseCookie,
      cookie,
      lastMutationID,
      patch: [
        {
          op: "put" as const,
          key: "log",
          value: logValue,
        },
      ],
    },
  };
}

function clientMap(...clients: Client[]): ClientMap {
  const res = new Map<string, Client>();
  for (const c of clients) {
    res.set(c.clientID, c);
  }
  return res;
}

function clientRecord(
  id: string,
  roomID: string,
  baseCookie: Cookie,
  lastMutationID: number
) {
  return {
    baseCookie,
    roomID,
    id,
    lastMutationID,
  };
}

function client(
  id: string,
  roomID: string,
  numPending = 0,
  startAtID = 1
): Client {
  return {
    clientID: id,
    roomID,
    pending: new Array(numPending)
      .fill(0)
      .map((_, i) => mutation(startAtID + i)),
    socket: new MockSocket(),
  };
}

function clientMutation(
  id: number,
  clientID: string,
  timestamp: number | undefined = undefined
): ClientMutation {
  return {
    clientID,
    timestamp,
    ...mutation(id),
  } as ClientMutation;
}

function mutation(id: number): Mutation {
  return {
    id,
    name: "m",
    args: id,
  };
}

class MockSocket {
  messages: string[] = [];
  send(data: string) {
    this.messages.push(data);
  }
  close() {}
}
