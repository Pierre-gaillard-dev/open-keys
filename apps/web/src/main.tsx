import "./app/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { App } from "./app/App";
import { createApp } from "./app/create-app";
import { registerServiceWorker } from "./app/pwa/register-service-worker";
import { offlineDb, outbox, persistQueryCache, startConnectivity } from "./shared/offline";

// No eval() probe: the CSP of the pages forbids 'unsafe-eval' (the JIT only speeds up large parses).
z.config({ jitless: true });

async function start(container: HTMLElement): Promise<void> {
  const { queryClient, router } = createApp();
  // Before the first render: offline, the route guards and pages start from the stored data (UC-14).
  await persistQueryCache(queryClient, offlineDb);
  outbox.start();
  startConnectivity();

  createRoot(container).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  );
  registerServiceWorker();
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in index.html");
}
void start(container);
