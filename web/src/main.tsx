import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesignMode } from "./design/DesignMode";
import "katex/dist/katex.min.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
const design =
  import.meta.env.VITE_DESIGN === "1" ||
  new URLSearchParams(window.location.search).has("design");
createRoot(root).render(
  <StrictMode>{design ? <DesignMode /> : <App />}</StrictMode>,
);
