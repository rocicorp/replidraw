import { z } from "zod";
import { pullRequestSchema, pullResponseSchema } from "./pull";
import { pushRequestSchema } from "./push";

export const requestSchema = z.union([
  z.tuple([z.literal("pushReq"), pushRequestSchema]),
  z.tuple([z.literal("pullReq"), pullRequestSchema]),
]);

export const responseSchema = z.tuple([
  z.literal("pullRes"),
  pullResponseSchema,
]);

export type Request = z.infer<typeof requestSchema>;
export type Response = z.infer<typeof responseSchema>;
