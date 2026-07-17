import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((item) => item.unregister())));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
