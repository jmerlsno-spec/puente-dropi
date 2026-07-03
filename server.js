// ============================================================
//  PUENTE DROPI — para Railway (servidor Node + Express)
//  Reenvía las peticiones de Ecom-Nance a Dropi sin el muro CORS,
//  saliendo desde la IP de Railway (que Dropi sí acepta).
//
//  + Módulo PLACES: autocompletado de direcciones (Google Places New)
//    La API key va en la variable de entorno GOOGLE_PLACES_KEY.
// ============================================================
const express = require("express");
const app = express();

const TARGET_BASE = "https://api.dropi.co/integrations";
const PLACES_KEY = process.env.GOOGLE_PLACES_KEY;

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

// ============================================================
//  PLACES — Autocompletar direcciones (va ANTES del catch-all)
// ============================================================

// 1) Sugerencias mientras el cliente escribe:  /places/autocomplete?q=...&token=...
app.get("/places/autocomplete", async (req, res) => {
  if (!PLACES_KEY) return res.status(500).json({ error: "FALTA_GOOGLE_PLACES_KEY" });
  const q = (req.query.q || "").trim();
  const token = req.query.token || "";
  if (q.length < 3) return res.json({ suggestions: [] });
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text"
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["co"],
        languageCode: "es",
        sessionToken: token || undefined
      })
    });
    const data = await r.json();
    const out = (data.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => ({
        placeId: s.placePrediction.placeId,
        text: (s.placePrediction.text && s.placePrediction.text.text) || ""
      }));
    res.json({ suggestions: out });
  } catch (e) {
    res.status(502).json({ error: "PLACES_AUTOCOMPLETE_FALLO", detalle: String(e) });
  }
});

// 2) Detalles al elegir una sugerencia:  /places/details?id=placeId&token=...
app.get("/places/details", async (req, res) => {
  if (!PLACES_KEY) return res.status(500).json({ error: "FALTA_GOOGLE_PLACES_KEY" });
  const id = req.query.id || "";
  const token = req.query.token || "";
  if (!id) return res.status(400).json({ error: "FALTA_PLACE_ID" });
  try {
    const url = "https://places.googleapis.com/v1/places/" + encodeURIComponent(id) +
                (token ? "?sessionToken=" + encodeURIComponent(token) : "");
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "formattedAddress,addressComponents,location,shortFormattedAddress"
      }
    });
    const d = await r.json();
    const comp = d.addressComponents || [];
    function pick(types) {
      const c = comp.find(x => (x.types || []).some(t => types.includes(t)));
      return c ? (c.longText || c.shortText || "") : "";
    }
    const ciudad = pick(["locality", "postal_town", "administrative_area_level_2"]);
    const depto = pick(["administrative_area_level_1"]);
    const via = [pick(["route"]), pick(["street_number"])].filter(Boolean).join(" ");
    res.json({
      direccion: d.shortFormattedAddress || d.formattedAddress || "",
      formatted: d.formattedAddress || "",
      via: via,
      ciudad: ciudad,
      departamento: depto,
      lat: d.location ? d.location.latitude : null,
      lng: d.location ? d.location.longitude : null
    });
  } catch (e) {
    res.status(502).json({ error: "PLACES_DETAILS_FALLO", detalle: String(e) });
  }
});

// ============================================================
//  Todo lo demás se reenvía a Dropi  (catch-all: SIEMPRE al final)
// ============================================================
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
