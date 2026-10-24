import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const app = createApp({
  dbPath: process.env.DB_PATH ?? 'arena.db',
  staticDir: fileURLToPath(new URL('../../client/dist', import.meta.url)),
});
const timer = app.loop.start();
const port = Number(process.env.PORT ?? 8080);
app.server.listen(port, () => console.log(`Space Arena listening on :${port}`));

function shutdown(): void {
  clearInterval(timer);
  app.saveAll();
  void app.close().then(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
