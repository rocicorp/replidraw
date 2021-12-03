import { z } from "zod";
import { jsonSchema } from "./json";

export const mutationSchema = z.object({
  id: z.number(),
  name: z.string(),
  args: jsonSchema,
});

export const pushRequestSchema = z.object({
  id: z.string(),
  mutations: z.array(mutationSchema),
  pushVersion: z.number(),
  schemaVersion: z.string(),
});

export const pushResponseSchema = z.object({
  id: z.string(),
});

export type Mutation = z.infer<typeof mutationSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
