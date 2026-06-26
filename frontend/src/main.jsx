import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Valuador from "./App.jsx";
import Inversion from "./Inversion.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Valuador />} />
        <Route path="/inversion" element={<Inversion />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
