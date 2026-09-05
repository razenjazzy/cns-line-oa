export const DEMO_PAGE_MARKUP = `
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
          <textarea id="chat-input" placeholder="Type a message or command, e.g. FORM QUOTE CREATE" rows="1"></textarea>
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
            <button id="send-line" type="button" class="ghost">Send PRODUCT FIND to /webhook-test</button>
          </div>
        </form>
        <pre id="journey-output">No journey executed yet.</pre>
      </article>
    </section>
  </div>
`;
