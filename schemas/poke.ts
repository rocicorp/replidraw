import { z } from "zod";
import { jsonSchema } from "./json";

// Replicache allows any JSON for the cookie, but we only use number.
// Note: Replicache always starts the cookie at `null` so we cannot
// get that out of the type.
export const cookieSchema = z.union([z.number(), z.null()]);

export const patchOperationSchema = z.union([
  z.object({
    op: z.literal("put"),
    key: z.string(),
    value: jsonSchema,
  }),
  z.object({
    op: z.literal("del"),
    key: z.string(),
  }),
  z.object({
    op: z.literal("clear"),
  }),
]);

export const patchSchema = z.array(patchOperationSchema);

export const pokeResponseSchema = z.object({
  baseCookie: cookieSchema,
  cookie: cookieSchema,
  lastMutationID: z.number(),
  patch: patchSchema,
});

export type Cookie = z.infer<typeof cookieSchema>;
export type PatchOperation = z.infer<typeof patchOperationSchema>;
export type Patch = z.infer<typeof patchSchema>;
export type PokeResponse = z.infer<typeof pokeResponseSchema>;
