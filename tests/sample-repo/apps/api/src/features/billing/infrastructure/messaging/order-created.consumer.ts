import { subscribe } from '../../../orders/infrastructure/messaging/amqp';
import { ChargeOrderUseCase } from '../../application/charge-order.use-case';

/**
 * Listens on orders.created and charges the order. The message is acked only
 * after the use case returns, so a crash mid-way redelivers it.
 */
export function startOrderCreatedConsumer(): void {
  const chargeOrder = new ChargeOrderUseCase();
  subscribe('orders.created', async (payload) => {
    const { orderId, total } = JSON.parse(payload) as { orderId: string; total: number };
    await chargeOrder.execute(orderId, total);
  });
}
