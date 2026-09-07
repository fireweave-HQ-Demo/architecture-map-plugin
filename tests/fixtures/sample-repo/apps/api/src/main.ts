import { registerOrderRoutes } from './features/orders/infrastructure/http/orders.routes';
import { startOrderCreatedConsumer } from './features/billing/infrastructure/messaging/order-created.consumer';
import { startOutboxRelay } from './features/orders/infrastructure/messaging/outbox.relay';

// One process, one HTTP listener, one message consumer. No scheduler here.
const routes = registerOrderRoutes();

Bun.serve({ port: 3000, routes });
startOrderCreatedConsumer();
startOutboxRelay();
