import type { OrderInput } from '@sample-shop/shared';

const API_URL = import.meta.env.API_URL ?? 'http://api:3000';

/**
 * POST /orders with the session cookie. Non-2xx responses surface the API's
 * error message so the page can show it next to the form.
 */
export async function createOrder(input: OrderInput): Promise<{ id: string; total: number }> {
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `order failed (${res.status})`);
  }
  return res.json();
}
