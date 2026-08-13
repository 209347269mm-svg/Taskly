import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// הזרקת Tailwind CSS
if (!document.getElementById("tailwind-script")) {
  const script = document.createElement("script");
  script.id = "tailwind-script";
  script.src = "https://cdn.tailwindcss.com";
  document.head.appendChild(script);
}

// יצירת element במידה וחסר
let rootElement = document.getElementById("root");
if (!rootElement) {
  rootElement = document.createElement("div");
  rootElement.id = "root";
  document.body.appendChild(rootElement);
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);