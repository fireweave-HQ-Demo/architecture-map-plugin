const sql = new Bun.SQL(process.env.DATABASE_URL!);

export class PgInvoiceRepository {
  async existsFor(orderId: string): Promise<boolean> {
    const rows = await sql`SELECT 1 FROM invoices WHERE order_id = ${orderId}`;
    return rows.length > 0;
  }

  async create(input: { orderId: string; amountDue: number }): Promise<void> {
    await sql`INSERT INTO invoices (order_id, amount_due, status) VALUES (${input.orderId}, ${input.amountDue}, 'open')`;
  }
}
