import { z } from "zod";

export const shapeSchema = z.object({
  type: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotate: z.number(),
  fill: z.string(),
});

export type Shape = z.infer<typeof shapeSchema>;
