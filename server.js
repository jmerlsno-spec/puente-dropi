// ============================================================
//  PUENTE DROPI — para Railway (servidor Node + Express)
//  Reenvía las peticiones de Ecom-Nance a Dropi sin el muro CORS,
//  saliendo desde la IP de Railway (que Dropi sí acepta).
// ============================================================
const express = require("express");
const app = express();

const TARGET_BASE = "https://api.dropi.co/integrations";

// Permitir que el navegador (tu app) llame a este puente
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, dropi-integracion-key, Authorization, X-Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Salud: para comprobar que el puente está vivo
app.get("/", (req, res) => res.send("Puente Dropi OK ✅"));

// Todo lo demás se reenvía a Dropi
app.use(async (req, res) => {
  const destino = TARGET_BASE.replace(/\/+$/, "") + req.originalUrl;
  try {
    const headers = { "Content-Type": "application/json" };
    if (req.headers["dropi-integracion-key"]) headers["dropi-integracion-key"] = req.headers["dropi-integracion-key"];
    if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];
    if (req.headers["x-authorization"]) headers["X-Authorization"] = req.headers["x-authorization"];

    const r = await fetch(destino, { method: req.method, headers });
    const body = await r.text();
    res.status(r.status);
    res.set("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: "PUENTE_NO_ALCANZA_DROPI", detalle: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Puente Dropi en puerto " + PORT));
