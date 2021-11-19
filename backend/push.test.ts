import { expect } from "chai";
import { test } from "mocha";
import { Mutation, push } from "./push";

test("push", async () => {
  type Case = {
    name: string;
    pending: Mutation[];
    request: Mutation[];
    expected: Mutation[];
  };

  const cases: Case[] = [
    {
      name: "empty + empty",
      pending: [],
      request: [],
      expected: [],
    },
    {
      name: "nonempty + empty",
      pending: [
        { id: 1, timestamp: 1 },
        { id: 2, timestamp: 2 },
      ],
      request: [],
      expected: [
        { id: 1, timestamp: 1 },
        { id: 2, timestamp: 2 },
      ],
    },
    {
      name: "empty + nonempty",
      pending: [],
      request: [
        { id: 1, timestamp: 3 },
        { id: 2, timestamp: 7 },
      ],
      expected: [
        { id: 1, timestamp: 101 },
        { id: 2, timestamp: 102 },
      ],
    },
    {
      name: "nonempty + end",
      pending: [
        { id: 1, timestamp: 1 },
        { id: 2, timestamp: 2 },
      ],
      request: [{ id: 3, timestamp: 3 }],
      expected: [
        { id: 1, timestamp: 1 },
        { id: 2, timestamp: 2 },
        { id: 3, timestamp: 101 },
      ],
    },
    {
      name: "nonempty + start",
      pending: [
        { id: 2, timestamp: 300 },
        { id: 3, timestamp: 301 },
      ],
      request: [{ id: 1, timestamp: 1 }],
      expected: [
        { id: 1, timestamp: 101 },
        { id: 2, timestamp: 300 },
        { id: 3, timestamp: 301 },
      ],
    },
    {
      name: "nonempty + middle",
      pending: [
        { id: 1, timestamp: 1 },
        { id: 5, timestamp: 300 },
      ],
      request: [{ id: 3, timestamp: 1 }],
      expected: [
        { id: 1, timestamp: 1 },
        { id: 3, timestamp: 101 },
        { id: 5, timestamp: 300 },
      ],
    },
    {
      name: "clamp above predecessor",
      pending: [{ id: 1, timestamp: 300 }],
      request: [{ id: 2, timestamp: 1 }],
      expected: [
        { id: 1, timestamp: 300 },
        // Even though now() vends 101, push() forces it to 300.
        { id: 2, timestamp: 300 },
      ],
    },
    {
      name: "clamp below follower",
      pending: [
        { id: 1, timestamp: 200 },
        { id: 3, timestamp: 400 },
      ],
      request: [{ id: 2, timestamp: 1 }],
      expected: [
        { id: 1, timestamp: 200 },
        { id: 2, timestamp: 200 },
        { id: 3, timestamp: 400 },
      ],
    },
  ];

  for (const c of cases) {
    let runCalled = false;
    const run = async () => {
      runCalled = true;
    };

    let clock = 100;
    const now = () => ++clock;

    push(
      { mutations: c.request },
      { clientID: "c1", pending: c.pending },
      { run },
      now
    );
    expect(c.pending).to.deep.equal(c.expected, c.name);
    expect(runCalled).equal(true, c.name);
  }
});
