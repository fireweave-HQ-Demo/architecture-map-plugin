import { PgInvoiceRepository } from '../infrastructure/persistence/pg-invoice.repository';

export class ChargeOrderUseCase {
  constructor(private readonly invoices = new PgInvoiceRepository()) {}

  /** Idempotent on orderId: the bus may deliver the same message twice. */
  async execute(orderId: string, amountDue: number): Promise<void> {
    if (await this.invoices.existsFor(orderId)) return;
    await this.invoices.create({ orderId, amountDue });
  }
}
