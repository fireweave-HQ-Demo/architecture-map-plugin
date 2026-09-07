import { publish } from './amqp';

/**
 * Direct publish after the save commits. Superseded by the outbox relay
 * (see outbox.relay.ts); kept for the release that still calls it.
 *
 * Billing is deployed separately, so it is not imported here — it listens
 * on the bus instead.
 */
export async function publishOrderCreated(orderId: string, total: number): Promise<void> {
  await publish('orders.created', JSON.stringify({ orderId, total }));
}
