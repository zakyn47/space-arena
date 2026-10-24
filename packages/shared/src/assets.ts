import { z } from 'zod';

export const SpriteSpecSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    anchor: z.tuple([z.number(), z.number()]),
    frames: z.number().int().positive(),
  })
  .strict();

export const ManifestSchema = z.object({ sprites: z.array(SpriteSpecSchema) }).strict();

export type SpriteSpec = z.infer<typeof SpriteSpecSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
