import { z } from "zod";
import { jsonSchema } from "./json";

export const pullRequestSchema = z.object({
  clientID: z.string(),
  cookie: jsonSchema,
  lastMutationID: z.number(),
  pullVersion: z.number(),
  schemaVersion: z.string(),
});

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

export const pullResponseSchema = z.object({
  cookie: jsonSchema,
  lastMutationID: z.number(),
  patch: patchSchema,
});

export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PatchOperation = z.infer<typeof patchOperationSchema>;
export type Patch = z.infer<typeof patchSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
