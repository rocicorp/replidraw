import { z } from "zod";
import { jsonSchema } from "./json";

export const mutationSchema = z.object({
  id: z.number(),
  name: z.string(),
  args: jsonSchema,
});

export const pushRequestSchema = z.object({
  clientID: z.string(),
  mutations: z.array(mutationSchema),
  pushVersion: z.number(),
  schemaVersion: z.string(),
});

export type Mutation = z.infer<typeof mutationSchema>;
export type PushRequequest = z.infer<typeof pushRequestSchema>;
