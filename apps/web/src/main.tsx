import "./app/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { App } from "./app/App";
import { createApp } from "./app/create-app";
import { registerServiceWorker } from "./app/pwa/register-service-worker";

// No eval() probe: the CSP of the pages forbids 'unsafe-eval' (the JIT only speeds up large parses).
z.config({ jitless: true });

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in index.html");
}

const { queryClient, router } = createApp();

createRoot(container).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);

registerServiceWorker();
