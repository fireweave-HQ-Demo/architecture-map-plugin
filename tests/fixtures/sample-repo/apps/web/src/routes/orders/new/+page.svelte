<script lang="ts">
  import { createOrder } from '$lib/api/orders.client';

  let sku = $state('');
  let quantity = $state(1);
  let error = $state('');

  // The form collects one line; the API derives the total and the id.
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      const { id } = await createOrder({ lines: [{ sku, quantity, unitPrice: 0 }] });
      location.assign(`/orders/${id}`);
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<form onsubmit={submit}>
  <input bind:value={sku} placeholder="SKU" />
  <input type="number" bind:value={quantity} min="1" />
  <button>Place order</button>
  {#if error}<p role="alert">{error}</p>{/if}
</form>
