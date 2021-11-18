import { PushRequest } from "../schemas/push";
import { Loop } from "./loop";
import { Client } from "./server";

export async function push(push: PushRequest, client: Client, loop: Loop) {
  console.log(
    "Processing push",
    JSON.stringify(push, null, ""),
    "for client",
    client.clientID
  );

  const t0 = Date.now();
  let prevTimestamp = 0;

  for (const m of push.mutations) {
    // TODO: Normalize timestamp
    m.timestamp = Math.max(prevTimestamp, performance.now());
    prevTimestamp = m.timestamp;

    const idx = client.pending.findIndex((p) => p.id >= m.id);
    if (idx == -1) {
      client.pending.push(m);
    } else if (client.pending[idx].id == m.id) {
      console.log(`Pending mutation ${m.id} already queued`);
      continue;
    } else {
      client.pending.splice(idx, 0, m);
    }
  }

  loop.run();

  console.log(`Processed push in ${Date.now() - t0}ms`);
}
