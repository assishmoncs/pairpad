const express = require('express');
const path = require('path');

const router = express.Router();
const OPENAPI_PATH = path.resolve(__dirname, '../../../docs/openapi.yaml');

router.get('/openapi.yaml', (_req, res) => {
  return res.type('application/yaml').sendFile(OPENAPI_PATH);
});

router.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PairPad API</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:4rem auto;padding:0 1rem;line-height:1.5}a{color:#0f766e}</style></head><body><h1>PairPad API</h1><p>Version <strong>1.0.0</strong>. The authoritative OpenAPI 3.1 contract is available as <a href="/api/openapi.yaml">openapi.yaml</a>.</p><p>Authentication uses short-lived Bearer access tokens with rotating HttpOnly refresh sessions.</p><p>REST authorization and validation remain server-side.</p></body></html>`);
});

module.exports = router;
