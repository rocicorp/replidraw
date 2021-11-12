import { z } from "zod";

export const pokeResponseSchema = z.object({});

export type Poke = z.infer<typeof pokeResponseSchema>;
