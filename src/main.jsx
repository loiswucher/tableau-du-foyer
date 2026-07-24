import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);

// PWA : enregistrement du service worker (ignoré dans l'APK, inutile là-bas)
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", import.meta.url), { scope: "./" })
      .catch((e) => console.warn("Service worker non enregistré", e));
  });
}
