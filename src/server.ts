import { config } from "./config";
import app from "./app";

function main() {
  try {
    const desiredPort = Number(config.port || 5000);

    const tryListen = (port: number) =>
      Bun.serve({
        port,
        fetch: app.fetch,
      });

    try {
      const server = tryListen(desiredPort);
      console.log(`🚀 Server running on http://localhost:${server.port}`);
      return server;
    } catch (err: any) {
      if (err?.code !== "EADDRINUSE") throw err;

      // If the preferred port is busy, automatically try the next few ports.
      for (let offset = 1; offset <= 20; offset++) {
        const port = desiredPort + offset;
        try {
          const server = tryListen(port);
          console.warn(
            `⚠️ Port ${desiredPort} is in use; switched to ${server.port}`
          );
          console.log(`🚀 Server running on http://localhost:${server.port}`);
          return server;
        } catch (e: any) {
          if (e?.code !== "EADDRINUSE") throw e;
        }
      }

      // Final fallback: let Bun choose an ephemeral port.
      const server = tryListen(0);
      console.warn(
        `⚠️ Ports ${desiredPort}-${desiredPort + 20} are in use; switched to ${
          server.port
        }`
      );
      console.log(`🚀 Server running on http://localhost:${server.port}`);
      return server;
    }
  } catch (error) {
    console.error("❗ Server startup error:", error);
  }
}

// Keep a strong reference to the server to prevent it from being GC'd.
// In Bun, if the returned server becomes unreachable, the process may exit.
const server = main();
(globalThis as any).__server = server;

if (!server) {
  process.exitCode = 1;
}
