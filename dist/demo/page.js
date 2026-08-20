"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDemoPage = void 0;
const buildDemoPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CNS Platform Control Panel</title>
  <style>
    :root {
      --bg: #f3ede4;
      --panel: rgba(255, 252, 248, 0.88);
      --ink: #1f2933;
      --muted: #52606d;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --alert: #c2410c;
      --line: #d9e2ec;
      --shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
      --radius: 18px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 0%, rgba(15, 118, 110, 0.2), transparent 34%),
        radial-gradient(circle at 90% 0%, rgba(194, 65, 12, 0.2), transparent 32%),
        linear-gradient(180deg, #faf6ef 0%, var(--bg) 100%);
      padding: 26px 18px 40px;
    }

    .shell { max-width: 1320px; margin: 0 auto; }

    .hero {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid rgba(217, 226, 236, 0.9);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .hero-copy { padding: 28px; }

    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.16em;
      font-weight: 700;
      color: var(--accent-strong);
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(30px, 4vw, 52px);
      line-height: 1;
    }

    .hero-copy p { margin: 0; color: var(--muted); max-width: 70ch; }

    .hero-side {
      padding: 22px;
      display: grid;
      gap: 10px;
      align-content: center;
      background: linear-gradient(180deg, rgba(15, 118, 110, 0.1), rgba(194, 65, 12, 0.1));
    }

    .chip {
      border-radius: 999px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.72);
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 700;
      width: fit-content;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
    }

    .card { padding: 20px; }
    .span-6 { grid-column: span 6; }
    .span-12 { grid-column: span 12; }

    h2 { margin: 0 0 10px; font-size: 22px; }
    h3 { margin: 12px 0 8px; font-size: 16px; }
    p { margin: 0 0 10px; color: var(--muted); }

    form { display: grid; gap: 10px; }

    .three-up {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .two-up {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    label {
      display: grid;
      gap: 5px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
    }

    input {
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.94);
      color: var(--ink);
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
    }

    input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
    }

    .actions { display: flex; gap: 8px; flex-wrap: wrap; }

    .token-row {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr auto;
      align-items: end;
      margin-bottom: 12px;
    }

    button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      color: white;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    }

    button.secondary { background: linear-gradient(135deg, #f97316, #c2410c); }
    button.ghost { background: #0b1822; }

    pre {
      margin: 0;
      min-height: 150px;
      max-height: 400px;
      overflow: auto;
      border-radius: 14px;
      background: #10202b;
      color: #d8ebff;
      padding: 14px;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }

    .timeline li {
      border: 1px dashed #bfd1df;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 13px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.66);
    }

    .warn { color: var(--alert); font-weight: 700; }

    .chat-card {
      padding: 18px;
    }

    .chat-display {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 360px;
      overflow: auto;
      padding: 12px;
      border-radius: 14px;
      background: #eef4f1;
    }

    .msg-row { display: flex; flex-direction: column; }

    .msg-user,
    .msg-bot {
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .msg-user {
      align-self: flex-end;
      background: var(--accent-strong);
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .msg-bot {
      align-self: flex-start;
      background: #ffffff;
      color: var(--ink);
      border: 1px solid rgba(217, 226, 236, 0.9);
      border-bottom-left-radius: 4px;
    }

    .msg-bot.card {
      align-self: flex-start;
      background: #ffffff;
      color: var(--ink);
      border: 1px solid var(--line);
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
    }

    .chat-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }

    .chat-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .nav-chip {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      background: #ffffff;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .chat-input-row {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr auto;
      align-items: end;
      margin-top: 12px;
    }

    .chat-input-row textarea {
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
      color: var(--ink);
      padding: 11px 12px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      min-height: 52px;
    }

    .chat-input-row textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
    }

    button.chat-send { padding: 11px 18px; }

    .chat-menu-panel {
      display: none;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .chat-menu-panel .nav-chip { background: var(--accent); color: #fff; border: 0; }

    @media (max-width: 1080px) {
      .hero { grid-template-columns: 1fr; }
      .span-6, .span-12 { grid-column: span 12; }
      .three-up { grid-template-columns: 1fr; }
      .two-up { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Platform Cost + Control</div>
        <h1>One panel to run operations, pricing, and full demo simulation.</h1>
        <p>Tune cost assumptions, control package pricing, run complete end-to-end flows, and validate platform economics before production rollout.</p>
        <div class="token-row">
          <label>Demo Access Token (required in production)
            <input id="demo-token" placeholder="Paste DEMO_CONTROL_TOKEN or OPS_API_TOKEN" />
          </label>
          <div class="actions">
            <button id="login-token" type="button" class="ghost">Login Session</button>
            <button id="logout-token" type="button" class="ghost">Logout</button>
          </div>
        </div>
      </div>
      <div class="panel hero-side">
        <div class="chip">Step 1: Verify connections</div>
        <div class="chip">Step 2: Tune pricing model</div>
        <div class="chip">Step 3: Run cost simulation</div>
        <div class="chip">Step 4: Run full journey + LINE simulation</div>
      </div>
    </section>

    <section class="grid">
      <article class="panel card span-6">
        <h2>Operations Snapshot</h2>
        <p>Instant health view for app, Firestore, Odoo, and demo endpoints.</p>
        <div class="actions">
          <button id="load-connections">Refresh Connections</button>
          <button id="run-audit" class="ghost">Run Workflow Audit</button>
          <button id="run-full-flow" class="secondary">Run Full Simulation Flow</button>
        </div>
        <pre id="connections-output">Loading connection status...</pre>
      </article>

      <article class="panel card span-6">
        <h2>Full-Step Runbook</h2>
        <p>Guided sequence for showcase or UAT dry-run.</p>
        <ul class="timeline">
          <li>1. Load /demo/connections and validate dependencies.</li>
          <li>2. Load current pricing control model.</li>
          <li>3. Run pricing simulation with current assumptions.</li>
          <li>4. Execute journey runner for Odoo create and readback.</li>
          <li>5. Push a simulated LINE command into /webhook-test.</li>
        </ul>
        <p class="warn">For production launch: protect demo endpoints behind OPS token or internal network policy.</p>
        <pre id="runbook-output">Runbook has not executed yet.</pre>
      </article>

      <article class="panel card span-12">
        <h2>Implementation Audit Report</h2>
        <p>Review implementation coverage of security, workflows, and production controls in one machine-readable report.</p>
        <pre id="audit-output">No audit executed yet.</pre>
      </article>

      <article class="panel card span-12 chat-card">
        <h2>Interactive Bot — Web Chat</h2>
        <p>Preview the assistant exactly as LINE users see it: the nav-button menu opens on the first click, and the chat box collects whatever info the guided commands need.</p>
        <div class="chat-display" id="chat-display"></div>
        <div class="chat-meta" id="chat-meta">The bot will open the menu on your first message.</div>
        <div class="chat-actions">
          <button id="chat-menu-toggle" type="button" class="ghost">Open Menu</button>
          <button id="chat-example" type="button" class="secondary">Try “create a quote”</button>
          <button id="chat-clear" type="button" class="ghost">Clear chat</button>
        </div>
        <div class="chat-menu-panel" id="chat-menu-panel"></div>
        <form id="chat-form" class="chat-input-row">
          <textarea id="chat-input" placeholder="Type a message or command, e.g. FORM DEMO QUOTE" rows="1"></textarea>
          <button class="chat-send" type="submit">Send</button>
        </form>
      </article>

      <article class="panel card span-12">
        <h2>Pricing Model Control</h2>
        <form id="pricing-model-form">
          <div class="three-up">
            <label>AI input cost / 1M tokens (USD)
              <input name="aiInputCostPer1MUsd" value="0.35" />
            </label>
            <label>AI output cost / 1M tokens (USD)
              <input name="aiOutputCostPer1MUsd" value="1.25" />
            </label>
            <label>LINE message cost (USD)
              <input name="lineMessageCostUsd" value="0.0012" />
            </label>
          </div>
          <div class="three-up">
            <label>Odoo RPC cost (USD)
              <input name="odooRpcCostUsd" value="0.0008" />
            </label>
            <label>Firestore read cost (USD)
              <input name="firestoreReadCostUsd" value="0.000002" />
            </label>
            <label>Firestore write cost (USD)
              <input name="firestoreWriteCostUsd" value="0.00001" />
            </label>
          </div>
          <div class="three-up">
            <label>Fixed infra monthly (USD)
              <input name="infraFixedMonthlyUsd" value="120" />
            </label>
            <label>Support/customer/monthly (USD)
              <input name="supportPerCustomerMonthlyUsd" value="18" />
            </label>
            <label>Monthly budget cap (USD)
              <input name="monthlyBudgetCapUsd" value="2500" />
            </label>
          </div>
          <div class="three-up">
            <label>Core markup %
              <input name="baseMarkupPercent" value="40" />
            </label>
            <label>Advanced markup %
              <input name="advancedMarkupPercent" value="70" />
            </label>
            <label>Enterprise markup %
              <input name="enterpriseMarkupPercent" value="120" />
            </label>
          </div>
          <div class="three-up">
            <label>Risk buffer %
              <input name="riskBufferPercent" value="12" />
            </label>
            <label>Target gross margin %
              <input name="targetGrossMarginPercent" value="65" />
            </label>
            <label>Expected paying customers
              <input name="expectedCustomers" value="35" />
            </label>
          </div>
          <div class="actions">
            <button type="button" id="load-pricing-model">Load Model</button>
            <button type="submit">Save Pricing Model</button>
          </div>
        </form>
        <pre id="pricing-model-output">Pricing model has not been loaded yet.</pre>
      </article>

      <article class="panel card span-6">
        <h2>Cost Simulation</h2>
        <form id="simulation-form">
          <div class="two-up">
            <label>Monthly active users
              <input name="monthlyActiveUsers" value="8000" />
            </label>
            <label>Avg messages/user/month
              <input name="avgMessagesPerUserPerMonth" value="26" />
            </label>
          </div>
          <div class="two-up">
            <label>Avg input tokens/message
              <input name="avgInputTokensPerMessage" value="320" />
            </label>
            <label>Avg output tokens/message
              <input name="avgOutputTokensPerMessage" value="220" />
            </label>
          </div>
          <div class="two-up">
            <label>Odoo calls/message
              <input name="odooCallsPerMessage" value="0.8" />
            </label>
            <label>Automation adoption (0-1)
              <input name="automationAdoptionRate" value="0.45" />
            </label>
          </div>
          <div class="two-up">
            <label>Firestore reads/message
              <input name="firestoreReadsPerMessage" value="2.5" />
            </label>
            <label>Firestore writes/message
              <input name="firestoreWritesPerMessage" value="1.1" />
            </label>
          </div>
          <button type="submit" class="secondary">Run Pricing Simulation</button>
        </form>
        <pre id="simulation-output">No simulation executed yet.</pre>
      </article>

      <article class="panel card span-6">
        <h2>Journey + LINE Simulator</h2>
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
          <div class="actions">
            <button type="submit">Run Journey</button>
            <button id="send-line" type="button" class="ghost">Send DEMO PRODUCT to /webhook-test</button>
          </div>
        </form>
        <pre id="journey-output">No journey executed yet.</pre>
      </article>
    </section>
  </div>

  <script>
    const pretty = (value) => JSON.stringify(value, null, 2);
    const toNum = (value) => Number(String(value).trim());

    const getManualToken = () => String(document.getElementById('demo-token').value || '').trim();

    const buildHeaders = (includeJson = false) => {
      const headers = {};
      if (includeJson) headers['Content-Type'] = 'application/json';
      return headers;
    };

    const getJson = async (url) => {
      const response = await fetch(url, { headers: buildHeaders(), credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(pretty(data));
      }
      return data;
    };

    const postJson = async (url, method, payload) => {
      const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: buildHeaders(true),
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(pretty(data));
      }
      return data;
    };

    async function loadConnections() {
      const output = document.getElementById('connections-output');
      output.textContent = 'Loading connection status...';
      const data = await getJson('/demo/connections');
      output.textContent = pretty(data);
      return data;
    }

    async function loginDemoSession() {
      const output = document.getElementById('runbook-output');
      output.textContent = 'Creating authenticated demo session...';
      const token = getManualToken();
      if (!token) {
        output.textContent = 'Enter demo token before login.';
        return;
      }

      const response = await fetch('/demo/session/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(pretty(data));
      output.textContent = 'Session login successful.';
      return data;
    }

    async function logoutDemoSession() {
      const output = document.getElementById('runbook-output');
      output.textContent = 'Logging out demo session...';
      const response = await fetch('/demo/session/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await response.json();
      output.textContent = response.ok ? 'Session logout successful.' : pretty(data);
      return data;
    }

    async function loadSessionStatus() {
      return getJson('/demo/session/status');
    }

    function writeModelToForm(model) {
      const form = document.getElementById('pricing-model-form');
      Object.keys(model).forEach((key) => {
        const input = form.elements.namedItem(key);
        if (input) input.value = String(model[key]);
      });
    }

    async function loadPricingModel() {
      const output = document.getElementById('pricing-model-output');
      output.textContent = 'Loading pricing model...';
      const data = await getJson('/demo/pricing-model');
      writeModelToForm(data.model || {});
      output.textContent = pretty(data);
      return data;
    }

    async function savePricingModel(event) {
      event.preventDefault();
      const output = document.getElementById('pricing-model-output');
      output.textContent = 'Saving pricing model...';
      const form = new FormData(event.currentTarget);
      const payload = {};
      for (const [key, value] of form.entries()) payload[key] = toNum(value);
      const data = await postJson('/demo/pricing-model', 'PUT', payload);
      output.textContent = pretty(data);
      return data;
    }

    async function runSimulation(event) {
      event.preventDefault();
      const output = document.getElementById('simulation-output');
      output.textContent = 'Running simulation...';
      const form = new FormData(event.currentTarget);
      const payload = {};
      for (const [key, value] of form.entries()) payload[key] = toNum(value);
      const expectedCustomers = document.getElementById('pricing-model-form').elements.namedItem('expectedCustomers');
      payload.expectedCustomers = toNum(expectedCustomers.value || 35);
      const data = await postJson('/demo/pricing-simulation', 'POST', payload);
      output.textContent = pretty(data);
      return data;
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
        qty: toNum(form.get('qty')),
        seedOdoo: String(form.get('seedOdoo')).toLowerCase() !== 'false',
      };
      const data = await postJson('/demo/journey', 'POST', payload);
      output.textContent = pretty(data);
      return data;
    }

    async function sendLineSimulation() {
      const output = document.getElementById('journey-output');
      output.textContent = 'Sending DEMO PRODUCT command to /webhook-test...';
      const form = new FormData(document.getElementById('journey-form'));
      const payload = {
        userId: form.get('userId'),
        text: 'DEMO PRODUCT ' + (form.get('productQuery') || 'App'),
      };
      const data = await postJson('/webhook-test', 'POST', payload);
      output.textContent = pretty(data);
      return data;
    }

    async function runFullFlow() {
      const output = document.getElementById('runbook-output');
      output.textContent = 'Executing full simulation flow...';
      const result = { steps: [] };

      try {
        const connections = await loadConnections();
        result.steps.push({ step: 'connections', ok: true, data: connections.connections });

        const audit = await runWorkflowAudit();
        result.steps.push({ step: 'workflow-audit', ok: audit.status !== 'needs_attention', data: { score: audit.score, failures: audit.failures || [] } });

        const model = await loadPricingModel();
        result.steps.push({ step: 'pricing-model', ok: true, data: model.model });

        const simulation = await runSimulation({ preventDefault: () => {}, currentTarget: document.getElementById('simulation-form') });
        result.steps.push({ step: 'pricing-simulation', ok: true, data: simulation.businessHealth });

        const journey = await runJourney({ preventDefault: () => {}, currentTarget: document.getElementById('journey-form') });
        result.steps.push({ step: 'journey', ok: true, data: { ok: journey.ok, summary: journey.summary || null } });

        const line = await sendLineSimulation();
        result.steps.push({ step: 'line-simulation', ok: true, data: line });
      } catch (error) {
        result.steps.push({ step: 'failed', ok: false, error: String(error) });
      }

      output.textContent = pretty(result);
    }

    async function runWorkflowAudit() {
      const output = document.getElementById('audit-output');
      output.textContent = 'Running workflow audit...';
      const data = await getJson('/demo/workflow-audit');
      const session = await loadSessionStatus();
      const report = { ...data, session };
      output.textContent = pretty(report);
      return report;
    }

    document.getElementById('load-connections').addEventListener('click', () => {
      loadConnections().catch((error) => {
        document.getElementById('connections-output').textContent = String(error);
      });
    });

    document.getElementById('run-audit').addEventListener('click', () => {
      runWorkflowAudit().catch((error) => {
        document.getElementById('audit-output').textContent = String(error);
      });
    });

    document.getElementById('run-full-flow').addEventListener('click', () => {
      runFullFlow().catch((error) => {
        document.getElementById('runbook-output').textContent = String(error);
      });
    });

    document.getElementById('load-pricing-model').addEventListener('click', () => {
      loadPricingModel().catch((error) => {
        document.getElementById('pricing-model-output').textContent = String(error);
      });
    });

    document.getElementById('pricing-model-form').addEventListener('submit', (event) => {
      savePricingModel(event).catch((error) => {
        document.getElementById('pricing-model-output').textContent = String(error);
      });
    });

    document.getElementById('simulation-form').addEventListener('submit', (event) => {
      runSimulation(event).catch((error) => {
        document.getElementById('simulation-output').textContent = String(error);
      });
    });

    document.getElementById('journey-form').addEventListener('submit', (event) => {
      runJourney(event).catch((error) => {
        document.getElementById('journey-output').textContent = String(error);
      });
    });

    document.getElementById('send-line').addEventListener('click', () => {
      sendLineSimulation().catch((error) => {
        document.getElementById('journey-output').textContent = String(error);
      });
    });

    document.getElementById('chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('chat-input');
      const value = input.value;
      input.value = '';
      sendChat(value).catch((error) => {
        input.placeholder = 'Try again — ' + String(error);
      });
    });

    document.getElementById('chat-menu-toggle').addEventListener('click', () => {
      const panel = document.getElementById('chat-menu-panel');
      renderChatMenu(panel.style.display !== 'flex');
    });

    document.getElementById('chat-example').addEventListener('click', () => {
      sendChat('FORM DEMO QUOTE').catch(() => {});
    });

    document.getElementById('chat-clear').addEventListener('click', () => {
      document.getElementById('chat-display').textContent = '';
      document.getElementById('chat-meta').textContent = 'Chat cleared.';
      renderChatMenu(false);
    });
      loginDemoSession()
        .then(() => runWorkflowAudit())
        .catch((error) => {
          document.getElementById('runbook-output').textContent = String(error);
        });
    });

    document.getElementById('logout-token').addEventListener('click', () => {
      logoutDemoSession().catch((error) => {
        document.getElementById('runbook-output').textContent = String(error);
      });
    });

    async function sendChat(text) {
      const display = document.getElementById('chat-display');
      const meta = document.getElementById('chat-meta');
      const value = text.trim();
      if (!value) return;

      const userRow = document.createElement('div');
      userRow.className = 'msg-row';
      const userBubble = document.createElement('div');
      userBubble.className = 'msg-user';
      userBubble.textContent = value;
      userRow.appendChild(userBubble);
      display.appendChild(userRow);

      meta.textContent = 'Assistant is thinking...';
      scrollChat();

      try {
        const data = await postJson('/demo/chat', 'POST', { text: value, userId: 'web_demo_user' });
        meta.textContent = (data.agentName || 'Bot') + ' · powered by the LINE routing engine';
        for (const line of data.transcript || []) {
          const botRow = document.createElement('div');
          botRow.className = 'msg-row';
          const botBubble = document.createElement('div');
          botBubble.className = line.kind === 'card' ? 'msg-bot card' : 'msg-bot';
          botBubble.textContent = line.text;
          botRow.appendChild(botBubble);
          display.appendChild(botRow);
        }
      } catch (error) {
        const botRow = document.createElement('div');
        botRow.className = 'msg-row';
        const botBubble = document.createElement('div');
        botBubble.className = 'msg-bot';
        botBubble.textContent = String(error);
        botRow.appendChild(botBubble);
        display.appendChild(botRow);
        meta.textContent = 'Something went wrong — check that the demo session is logged in.';
      }
      scrollChat();
    }

    function scrollChat() {
      const display = document.getElementById('chat-display');
      display.scrollTop = display.scrollHeight;
    }

    const CHAT_MENU_ITEMS = [
      ['Products & Quotes: Find a product', 'FORM DEMO PRODUCT'],
      ['Create a quote', 'FORM DEMO QUOTE'],
      ['Check an order', 'FORM DEMO ORDER'],
      ['Browse catalog', 'SERVICE LIST'],
      ['Group-Buy status', 'STATUS GROUPBUY'],
    ];

    function renderChatMenu(open) {
      const panel = document.getElementById('chat-menu-panel');
      panel.style.display = open ? 'flex' : 'none';
      if (!open) return;
      panel.innerHTML = '';
      CHAT_MENU_ITEMS.forEach(([label, command]) => {
        const chip = document.createElement('button');
        chip.className = 'nav-chip';
        chip.type = 'button';
        chip.textContent = label;
        chip.addEventListener('click', () => {
          document.getElementById('chat-input').value = command;
          sendChat(command);
          renderChatMenu(false);
        });
        panel.appendChild(chip);
      });
    }

    async function bootstrapDemoPanel() {
      try {
        const session = await loadSessionStatus();
        if (!session.authenticated && session.mode !== 'development') {
          const message = 'Login required: enter token and click Login Session before running production demo controls.';
          document.getElementById('runbook-output').textContent = message;
          document.getElementById('audit-output').textContent = pretty({ session, message });
          return;
        }

        await Promise.all([loadConnections(), loadPricingModel(), runWorkflowAudit()]);
      } catch (error) {
        document.getElementById('runbook-output').textContent = String(error);
      }
    }

    bootstrapDemoPanel();
  </script>
</body>
</html>`;
exports.buildDemoPage = buildDemoPage;
