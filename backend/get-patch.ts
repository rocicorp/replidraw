import { Patch, Cookie } from "schemas/poke";
import { getCookie } from "./data";
import { Executor } from "./db";

export async function getPatch(
  executor: Executor,
  docID: string,
  fromCookie: Cookie
): Promise<Patch> {
  const t0 = Date.now();
  const entries = await executor(
    `select k, v, deleted from object where documentid = $1 and version > $2`,
    [docID, fromCookie ?? 0]
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
