import { clients } from "./server";

export type PushRequest = {
  mutations: Mutation[];
};

export type Client = {
  clientID: string;
  pending: Mutation[];
};

export type Mutation = {
  id: number;
  timestamp?: number | undefined;
};

export type Loop = {
  run(): Promise<void>;
};

export type Now = () => number;

export function push(push: PushRequest, client: Client, loop: Loop, now: Now) {
  console.log(
    "Processing push",
    JSON.stringify(push, null, ""),
    "for client",
    client.clientID
  );

  const t0 = performance.now();

  const pending = client.pending;
  for (const m of push.mutations) {
    let idx = pending.findIndex((p) => p.id >= m.id);

    if (idx > -1 && pending[idx].id == m.id) {
      console.log(`Pending mutation ${m.id} already queued`);
      continue;
    }

    if (idx == -1) {
      idx = pending.length;
    }

    // Timestamps must increase monotonically wrt mutation ID.
    // This only matters while mutations are pending as it is only used
    // as a heuristic as to the total order to commit in.
    m.timestamp = clamp(
      now(),
      pending[idx - 1]?.timestamp ?? 0,
      pending[idx]?.timestamp ?? Infinity
    );

    pending.splice(idx, 0, m);
  }

  loop.run();

  console.log(`Processed push in ${performance.now() - t0}ms`);
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}
