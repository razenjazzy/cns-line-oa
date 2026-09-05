// Fix note: the `login-token` button was missing its addEventListener
// registration entirely — the callback body that ran loginDemoSession()
// was orphaned code with no enclosing listener, a syntax error that broke
// this whole inline script in the browser (no listeners attached at all).
// Restored below.
export const DEMO_PAGE_SCRIPT = `
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

    async function loadPlatform() {
      const grid = document.getElementById('platform-modules');
      const stores = document.getElementById('platform-stores');
      const scriptOut = document.getElementById('platform-script');
      const data = await getJson('/demo/platform');
      stores.textContent = [
        'Firestore: ' + data.stores.firestore,
        'Odoo: ' + data.stores.odoo,
        'Mongo: ' + data.stores.mongo,
      ].join(' · ');
      scriptOut.textContent = (data.demoDayScript || []).map((step, index) => (index + 1) + '. ' + step).join('\\n');
      grid.innerHTML = '';
      (data.modules || []).forEach((mod) => {
        const card = document.createElement('div');
        card.className = 'module-card';
        const title = document.createElement('h3');
        title.textContent = mod.name + ' (' + mod.status + ')';
        const meta = document.createElement('p');
        meta.textContent = mod.audience + ' · store: ' + mod.store;
        const talk = document.createElement('p');
        talk.textContent = mod.demoTalkTrack;
        const cmds = document.createElement('code');
        cmds.textContent = (mod.commands || []).slice(0, 4).join(' · ');
        card.append(title, meta, talk, cmds);
        grid.appendChild(card);
      });
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
      output.textContent = 'Sending PRODUCT FIND command to /webhook-test...';
      const form = new FormData(document.getElementById('journey-form'));
      const payload = {
        userId: form.get('userId'),
        text: 'PRODUCT FIND ' + (form.get('productQuery') || 'App'),
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
      sendChat('FORM QUOTE CREATE').catch(() => {});
    });

    document.getElementById('chat-clear').addEventListener('click', () => {
      document.getElementById('chat-display').textContent = '';
      document.getElementById('chat-meta').textContent = 'Chat cleared.';
      renderChatMenu(false);
    });
    document.getElementById('login-token').addEventListener('click', () => {
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
      ['Products & Quotes: Find a product', 'FORM PRODUCT FIND'],
      ['Create a quote', 'FORM QUOTE CREATE'],
      ['Check an order', 'FORM ORDER STATUS'],
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

        await Promise.all([loadConnections(), loadPlatform(), loadPricingModel(), runWorkflowAudit()]);
      } catch (error) {
        document.getElementById('runbook-output').textContent = String(error);
      }
    }

    bootstrapDemoPanel();
`;
