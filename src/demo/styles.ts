export const DEMO_PAGE_STYLES = `
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
`;
