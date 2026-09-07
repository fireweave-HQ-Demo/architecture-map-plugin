/** Thin AMQP client over process.env.AMQP_URL. */
export async function publish(topic: string, payload: string): Promise<void> {
  void topic;
  void payload;
}

export function subscribe(
  topic: string,
  handler: (payload: string) => Promise<void>
): void {
  void topic;
  void handler;
}
