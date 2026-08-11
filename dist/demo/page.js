"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDemoPage = void 0;
const buildDemoPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CNS LINE OA Demo Console</title>
  <style>
    :root {
      --bg: #f4efe7;
      --panel: rgba(255, 252, 247, 0.86);
      --ink: #1f2933;
      --muted: #52606d;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --warm: #f97316;
      --line: #d9e2ec;
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
      --radius: 20px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(249, 115, 22, 0.18), transparent 32%),
        linear-gradient(180deg, #f8f4ed 0%, var(--bg) 100%);
      padding: 32px 20px 48px;
    }

    .shell {
      max-width: 1180px;
      margin: 0 auto;
    }

    .hero {
      display: grid;
      gap: 18px;
      grid-template-columns: 1.4fr 1fr;
      align-items: stretch;
      margin-bottom: 24px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid rgba(217, 226, 236, 0.8);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .hero-copy {
      padding: 30px;
    }

    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 12px;
      color: var(--accent-strong);
      margin-bottom: 12px;
      font-weight: 700;
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(32px, 4vw, 54px);
      line-height: 0.95;
    }

    .hero-copy p,
    .notes li,
    label,
    input,
    button,
    pre {
      font-size: 15px;
      line-height: 1.5;
    }

    .hero-copy p {
      margin: 0;
      color: var(--muted);
      max-width: 58ch;
    }

    .hero-side {
      padding: 24px;
      display: grid;
      gap: 14px;
      align-content: center;
      background: linear-gradient(180deg, rgba(15, 118, 110, 0.08), rgba(249, 115, 22, 0.08));
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.7);
      color: var(--accent-strong);
      width: fit-content;
      font-weight: 700;
    }

    .grid {
      display: grid;
      gap: 20px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card {
      padding: 24px;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 22px;
    }

    form {
      display: grid;
      gap: 12px;
    }

    .two-up {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-weight: 600;
    }

    input {
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.95);
      padding: 12px 14px;
      color: var(--ink);
      outline: none;
    }

    input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.14);
    }

    button {
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
      color: white;
      padding: 12px 16px;
      font-weight: 700;
      cursor: pointer;
    }

    button.secondary {
      background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
    }

    pre {
      margin: 0;
      padding: 16px;
      min-height: 220px;
      border-radius: 16px;
      background: #13212b;
      color: #e5eef7;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .notes {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }

    @media (max-width: 900px) {
      .hero,
      .grid,
      .two-up {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">CNS Integration Demo</div>
        <h1>LINE OA, your app, and Odoo in one console.</h1>
        <p>Use this page to verify connectivity, run an end-to-end journey that maps an application user to Odoo, and simulate LINE OA messages through the same webhook-test path your app already exposes.</p>
      </div>
      <div class="panel hero-side">
        <div class="chip">1. Check connections</div>
        <div class="chip">2. Run demo journey</div>
        <div class="chip">3. Simulate a LINE message</div>
      </div>
    </section>

    <section class="grid">
      <article class="panel card">
        <h2>Connections</h2>
        <p class="notes">Inspect whether LINE OA credentials, Firestore project wiring, and Odoo connectivity are ready before you present the flow.</p>
        <form id="connections-form">
          <button type="submit">Load connection status</button>
        </form>
        <pre id="connections-output">Loading demo overview...</pre>
      </article>

      <article class="panel card">
        <h2>Journey Runner</h2>
        <form id="journey-form">
          <div class="two-up">
            <label>User ID
              <input name="userId" value="demo_line_user" />
            </label>
            <label>Language
              <input name="language" value="th" />
            </label>
          </div>
          <div class="two-up">
            <label>Customer name
              <input name="customerName" value="LINE Demo Customer" />
            </label>
            <label>Customer phone
              <input name="customerPhone" value="0990000000" />
            </label>
          </div>
          <div class="two-up">
            <label>Customer email
              <input name="customerEmail" value="line.demo@example.com" />
            </label>
            <label>Product query
              <input name="productQuery" value="App Premium Plan" />
            </label>
          </div>
          <div class="two-up">
            <label>Quantity
              <input name="qty" value="1" />
            </label>
            <label>Seed Odoo first
              <input name="seedOdoo" value="true" />
            </label>
          </div>
          <button type="submit">Run end-to-end journey</button>
        </form>
        <pre id="journey-output">No journey executed yet.</pre>
      </article>

      <article class="panel card">
        <h2>LINE Simulation</h2>
        <form id="line-form">
          <div class="two-up">
            <label>User ID
              <input name="userId" value="demo_line_user" />
            </label>
            <label>Text message
              <input name="text" value="DEMO PRODUCT App" />
            </label>
          </div>
          <button type="submit" class="secondary">Send to /webhook-test</button>
        </form>
        <pre id="line-output">No simulated LINE message sent yet.</pre>
      </article>

      <article class="panel card">
        <h2>Presentation Notes</h2>
        <ul class="notes">
          <li>The live LINE webhook remains at <strong>/webhook</strong>; this page uses <strong>/webhook-test</strong> for controlled demos.</li>
          <li>The journey runner seeds demo data, maps a user into Firestore, resolves an Odoo product, creates a quotation, and reads it back.</li>
          <li>After the journey succeeds, use the returned sample commands directly in LINE or in the simulator.</li>
        </ul>
      </article>
    </section>
  </div>

  <script>
    const pretty = (value) => JSON.stringify(value, null, 2);

    async function loadConnections() {
      const output = document.getElementById('connections-output');
      output.textContent = 'Loading connection status...';
      const response = await fetch('/demo/connections');
      const data = await response.json();
      output.textContent = pretty(data);
    }

    async function runJourney(event) {
      event.preventDefault();
      const output = document.getElementById('journey-output');
      output.textContent = 'Running end-to-end journey...';
      const form = new FormData(event.currentTarget);
      const payload = {
        userId: form.get('userId'),
        language: form.get('language'),
        customerName: form.get('customerName'),
        customerPhone: form.get('customerPhone'),
        customerEmail: form.get('customerEmail'),
        productQuery: form.get('productQuery'),
        qty: Number(form.get('qty')),
        seedOdoo: String(form.get('seedOdoo')).toLowerCase() !== 'false',
      };

      const response = await fetch('/demo/journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      output.textContent = pretty(data);
    }

    async function sendLineMessage(event) {
      event.preventDefault();
      const output = document.getElementById('line-output');
      output.textContent = 'Sending simulated LINE message...';
      const form = new FormData(event.currentTarget);
      const payload = {
        userId: form.get('userId'),
        text: form.get('text'),
      };

      const response = await fetch('/webhook-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      output.textContent = pretty(data);
    }

    document.getElementById('connections-form').addEventListener('submit', (event) => {
      event.preventDefault();
      loadConnections().catch((error) => {
        document.getElementById('connections-output').textContent = String(error);
      });
    });
    document.getElementById('journey-form').addEventListener('submit', (event) => {
      runJourney(event).catch((error) => {
        document.getElementById('journey-output').textContent = String(error);
      });
    });
    document.getElementById('line-form').addEventListener('submit', (event) => {
      sendLineMessage(event).catch((error) => {
        document.getElementById('line-output').textContent = String(error);
      });
    });

    loadConnections().catch((error) => {
      document.getElementById('connections-output').textContent = String(error);
    });
  </script>
</body>
</html>`;
exports.buildDemoPage = buildDemoPage;
