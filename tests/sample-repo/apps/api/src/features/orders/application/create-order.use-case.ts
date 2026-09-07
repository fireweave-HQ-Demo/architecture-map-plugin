import { Order, type OrderLine } from '../domain/order';
import type { OrderRepository } from './ports/order-repository.port';

export interface CreateOrderInput {
  customerId: string;
  lines: OrderLine[];
}

export class CreateOrderUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<{ id: string; total: number }> {
    const order = Order.create(crypto.randomUUID(), input.customerId, input.lines);
    // The repository writes the outbox row in the same transaction; the relay
    // publishes orders.created afterwards. Nothing is published from here.
    await this.orders.save(order);
    return { id: order.id, total: order.total };
  }
}
