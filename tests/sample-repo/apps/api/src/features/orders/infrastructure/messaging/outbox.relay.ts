import { publish } from './amqp';

const sql = new Bun.SQL(process.env.DATABASE_URL!);

/**
 * Every second: read unsent outbox rows, publish each to the bus, mark sent.
 * Publishing is at-least-once; consumers must tolerate a repeat.
 */
export function startOutboxRelay(): void {
  setInterval(async () => {
    const rows = await sql`SELECT id, topic, payload FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 100`;
    for (const row of rows) {
      await publish(row.topic, row.payload);
      await sql`UPDATE outbox SET sent_at = now() WHERE id = ${row.id}`;
    }
  }, 1000);
}
