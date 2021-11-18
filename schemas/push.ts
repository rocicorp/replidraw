import { z } from "zod";
import { jsonSchema } from "./json";

export const mutationSchema = z.object({
  id: z.number(),
  name: z.string(),
  args: jsonSchema,
  // TODO: Will be required soon.
  timestamp: z.number().optional(),
});

export const pushRequestSchema = z.object({
  mutations: z.array(mutationSchema),
  pushVersion: z.number(),
  schemaVersion: z.string(),
});

export type Mutation = z.infer<typeof mutationSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
