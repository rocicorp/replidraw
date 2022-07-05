import { ReadTransaction, WriteTransaction } from "replicache";
import { z } from "zod";

import { nanoid } from "nanoid";
import { randInt } from "./rand";

export const shapePrefix = `shape-`;

export const shapeKey = (id: string) => `${shapePrefix}${id}`;

export const shapeID = (key: string) => {
  if (!key.startsWith(shapePrefix)) {
    throw new Error(`Invalid key: ${key}`);
  }
  return key.substring(shapePrefix.length);
};

export const shapeSchema = z.object({
  id: z.string(),
  type: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotate: z.number(),
  fill: z.string(),
  animate: z.boolean(),
});

export type Shape = z.TypeOf<typeof shapeSchema>;

const shapeValueSchema = shapeSchema.omit({ id: true });

export async function getShape(
  tx: ReadTransaction,
  id: string
): Promise<Shape | undefined> {
  const val = await tx.get(shapeKey(id));
  if (val === undefined) {
    console.log(`Specified shape ${id} not found.`);
    return undefined;
  }
  return {
    id,
    ...shapeValueSchema.parse(val),
  };
}

export async function putShape(
  tx: WriteTransaction,
  shape: Shape
): Promise<void> {
  await tx.put(shapeKey(shape.id), shape);
}

export async function deleteShape(
  tx: WriteTransaction,
  id: string
): Promise<void> {
  await tx.del(shapeKey(id));
}

export async function moveShape(
  tx: WriteTransaction,
  {
    id,
    dx,
    dy,
    animate = true,
  }: { id: string; dx: number; dy: number; animate?: boolean }
): Promise<void> {
  const shape = await getShape(tx, id);
  if (shape) {
    shape.x += dx;
    shape.y += dy;
    shape.animate = animate;
    await putShape(tx, shape);
  }
}

export async function resizeShape(
  tx: WriteTransaction,
  { id, ds, animate = true }: { id: string; ds: number; animate?: boolean }
): Promise<void> {
  const shape = await getShape(tx, id);
  if (shape) {
    const minSize = 10;
    const dw = Math.max(minSize - shape.width, ds);
    const dh = Math.max(minSize - shape.height, ds);
    shape.width += dw;
    shape.height += dh;
    shape.x -= dw / 2;
    shape.y -= dh / 2;
    shape.animate = animate;
    await putShape(tx, shape);
  }
}

export async function rotateShape(
  tx: WriteTransaction,
  { id, ddeg, animate = true }: { id: string; ddeg: number; animate?: boolean }
): Promise<void> {
  const shape = await getShape(tx, id);
  if (shape) {
    shape.rotate += ddeg;
    shape.animate = animate;
    await putShape(tx, shape);
  }
}

export async function initShapes(tx: WriteTransaction, shapes: Shape[]) {
  if (await tx.has("initialized")) {
    return;
  }
  await Promise.all([
    tx.put("initialized", true),
    ...shapes.map((s) => putShape(tx, s)),
  ]);
}

function key(id: string): string {
  return `${shapePrefix}${id}`;
}

const colors = ["red", "blue", "white", "green", "yellow"];
let nextColor = 0;

export function randomShape() {
  const s = randInt(100, 400);
  const fill = colors[nextColor++];
  if (nextColor == colors.length) {
    nextColor = 0;
  }
  return {
    id: nanoid(),
    type: "rect",
    x: randInt(0, 400),
    y: randInt(0, 400),
    width: s,
    height: s,
    rotate: randInt(0, 359),
    fill,
    animate: false,
  } as Shape;
}
