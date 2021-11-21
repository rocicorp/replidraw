import { Patch, Cookie } from "schemas/poke";
import { Executor } from "./db";

export async function getPatch(
  executor: Executor,
  roomID: string,
  fromCookie: Cookie
): Promise<Patch> {
  const t0 = Date.now();
  const entries = await executor(
    `select k, v, deleted from object where roomid = $1 and version > $2`,
    [roomID, fromCookie ?? 0]
  );
  console.log(`Read ${entries.rows.length} objects in`, Date.now() - t0);

  const patch: Patch = [];
  for (let row of entries.rows) {
    const { k, v, deleted } = row;
    if (deleted) {
      patch.push({
        op: "del",
        key: k,
      });
    } else {
      patch.push({
        op: "put",
        key: k,
        value: JSON.parse(v),
      });
    }
  }
  return patch;
}
