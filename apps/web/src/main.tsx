import "./app/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createApp } from "./app/create-app";

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
