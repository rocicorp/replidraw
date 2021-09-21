import { ReadTransaction, WriteTransaction } from "replicache";
import * as t from "io-ts";
import { must } from "./decode";

export const draw = t.type({
  radius: t.number,
  color: t.string,
  cx: t.number,
  cy: t.number,
});

export type Draw = t.TypeOf<typeof draw>;

export async function getDraw(
  tx: ReadTransaction,
  id: string
): Promise<Draw | null> {
  const jv = await tx.get(key(id));
  if (!jv) {
    console.log(`Specified draw ${id} not found.`);
    return null;
  }
  return must(draw.decode(jv));
}

export function putDraw(
  tx: WriteTransaction,
  { id, draw }: { id: string; draw: Draw }
): Promise<void> {
  return tx.put(key(id), draw);
}

function key(id: string): string {
  return `${drawPrefix}${id}`;
}

export const drawPrefix = "draw-";
