export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class Order {
  private constructor(
    readonly id: string,
    readonly customerId: string,
    readonly lines: OrderLine[],
    readonly total: number
  ) {}

  /** An order must have at least one line; the total is derived, never passed in. */
  static create(id: string, customerId: string, lines: OrderLine[]): Order {
    if (lines.length === 0) throw new Error('order has no lines');
    const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    return new Order(id, customerId, lines, total);
  }
}
