import { z } from "zod";

export const userInfoSchema = z.object({
  avatar: z.string(),
  name: z.string(),
  color: z.string(),
});

// TODO: It would be good to merge this with the first-class concept of `client`
// that Replicache itself manages if possible.
export const clientStateSchema = z.object({
  cursor: z.object({
    x: z.number(),
    y: z.number(),
  }),
  overID: z.string(),
  selectedID: z.string(),
  userInfo: userInfoSchema,
});

export type UserInfo = z.infer<typeof userInfoSchema>;
export type ClientState = z.infer<typeof clientStateSchema>;
