import React from "react";
import ReactDOM from "react-dom/client";
import { RecordingOverlay } from "../components/RecordingOverlay";
import "../styles/globals.css";

ReactDOM.createRoot(document.getElementById("overlay-root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
