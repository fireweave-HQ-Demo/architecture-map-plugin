import { orderInputSchema } from '@sample-shop/shared';

import { requireUser } from '../../../../shared/auth/require-user.middleware';
import { CreateOrderUseCase } from '../../application/create-order.use-case';
import { PgOrderRepository } from '../persistence/pg-order.repository';

export function registerOrderRoutes() {
  const createOrder = new CreateOrderUseCase(new PgOrderRepository());

  return {
    '/orders': {
      POST: async (req: Request) => {
        const userId = requireUser(req);
        if (!userId) return Response.json({ error: 'sign in first' }, { status: 401 });

        const parsed = orderInputSchema.safeParse(await req.json());
        if (!parsed.success) {
          return Response.json({ error: 'order needs at least one line' }, { status: 400 });
        }

        const result = await createOrder.execute({
          customerId: userId,
          lines: parsed.data.lines,
        });
        return Response.json(result, { status: 201 });
      },
    },
  };
}
