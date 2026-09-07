import type { Order } from '../../domain/order';

export interface OrderRepository {
  /** Persist the order, its lines, and an outbox row in one transaction. */
  save(order: Order): Promise<void>;
}
