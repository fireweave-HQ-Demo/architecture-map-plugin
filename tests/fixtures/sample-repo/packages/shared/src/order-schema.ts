import { z } from 'zod';

/** Wire shape of a new order. Shared by the web client and the API route. */
export const orderInputSchema = z.object({
  lines: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
