# sample-shop

Tiny e-commerce monorepo used only by the architecture-map tests and golden
fixtures. Not a product.

```
apps/web          SvelteKit-style routes (create order UI)
apps/api          layered features (orders, billing) + shared auth
packages/shared   order schema
infra/compose.yaml  postgres · rabbitmq · api · web
```

Golden maps under `plugins/.../runtime/fixtures/` were traced from this tree.
Do not rename paths without regenerating those fixtures.
