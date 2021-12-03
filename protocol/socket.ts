import { z } from "zod";
import { pokeResponseSchema } from "./poke";
import { pullRequestSchema, pullResponseSchema } from "./pull";
import { pushRequestSchema, pushResponseSchema } from "./push";

export const requestSchema = z.union([
  z.tuple([z.literal("pushReq"), pushRequestSchema]),
  z.tuple([z.literal("pullReq"), pullRequestSchema]),
]);

export const responseSchema = z.union([
  z.tuple([z.literal("pushRes"), pushResponseSchema]),
  z.tuple([z.literal("pullRes"), pullResponseSchema]),
  z.tuple([z.literal("pokeRes"), pokeResponseSchema]),
]);

export type Request = z.infer<typeof requestSchema>;
export type Response = z.infer<typeof responseSchema>;
