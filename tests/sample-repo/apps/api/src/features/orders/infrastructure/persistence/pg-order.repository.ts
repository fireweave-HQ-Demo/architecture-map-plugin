import type { Order } from '../../domain/order';
import type { OrderRepository } from '../../application/ports/order-repository.port';

const sql = new Bun.SQL(process.env.DATABASE_URL!);

export class PgOrderRepository implements OrderRepository {
  /**
   * Order, lines, and the orders.created outbox row go in one transaction so
   * a crash between "saved" and "announced" cannot lose the event.
   * Any failed insert rolls the whole thing back and rethrows.
   */
  async save(order: Order): Promise<void> {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO orders (id, customer_id, total) VALUES (${order.id}, ${order.customerId}, ${order.total})`;
      for (const line of order.lines) {
        await tx`INSERT INTO order_lines (order_id, sku, quantity, unit_price) VALUES (${order.id}, ${line.sku}, ${line.quantity}, ${line.unitPrice})`;
      }
      await tx`INSERT INTO outbox (topic, payload) VALUES ('orders.created', ${JSON.stringify({ orderId: order.id, total: order.total })})`;
    });
  }
}
