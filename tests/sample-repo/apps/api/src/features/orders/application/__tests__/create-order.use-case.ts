import { expect, test } from 'bun:test';

import { CreateOrderUseCase } from '../create-order.use-case';

test('rejects an order with no lines', async () => {
  const useCase = new CreateOrderUseCase({ save: async () => {} });
  await expect(useCase.execute({ customerId: 'c1', lines: [] })).rejects.toThrow(
    'order has no lines'
  );
});
