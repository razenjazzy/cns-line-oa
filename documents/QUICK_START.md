# 🚀 CNS LINE OA - Quick Start Guide

## Project Built Successfully ✅

Your LINE commerce bot project is **fully compiled and ready to deploy**.

---

## 📋 Quick Commands

### Development
```bash
npm run dev        # Watch mode with nodemon (auto-restart on file changes)
```

### Production
```bash
npm run build      # Compile TypeScript → dist/
npm start          # Run from dist/index.js
```

### Docker
```bash
docker build -t cns-line-oa .              # Build image
docker run -p 8080:8080 --env-file .env cns-line-oa  # Run locally
./deploy.sh        # Deploy to Cloud Run
```

### Free Cloudflare Tunnel
```bash
./deploy-cloudflare.sh   # Build the app and expose localhost:8080 through Cloudflare Tunnel
```

---

## 🔑 What's Included

✅ **All Source Files** - 11 TypeScript files  
✅ **Compiled JavaScript** - Ready to run  
✅ **Dependencies** - 434 npm packages  
✅ **Environment Config** - .env file  
✅ **Docker Setup** - Dockerfile + deploy.sh  
✅ **Build Tools** - TypeScript, nodemon, ts-node  

---

## 📂 File Locations

| What | Where |
|------|-------|
| Source Code | `src/` |
| Compiled Code | `dist/` |
| Config | `.env`, `tsconfig.json` |
| Package Info | `package.json` |
| Docker | `Dockerfile`, `deploy.sh` |
| Cloudflare Tunnel | `deploy-cloudflare.sh` |

---

## 🧪 Test the Bot

1. **Add bot to LINE** using QR code from LINE Developer Console
2. **Send test messages**:
   - `เริ่มต้น` → show full Thai demo journey
   - `DEMO SEED ODOO` → upload sample products + quotations to Odoo
   - `DEMO PRODUCT App` → read product from Odoo
   - `DEMO QUOTE App Premium Plan,1,สมชาย,0812345678` → create quotation in Odoo
   - `DEMO ORDER SO0001` → check order status from Odoo
   - `DEMO REPORT` → send Thai daily report using real Odoo data

### Demo Console

Open `http://localhost:8080/demo` to run the guided demo console.

- `GET /demo/connections` → returns LINE OA, Odoo, and Firestore connection status
- `POST /demo/journey` → runs an end-to-end application-to-Odoo journey and returns each step
- `POST /webhook-test` → simulates a LINE OA user message through the app without signature validation

---

## ⚙️ Configuration

### Required Environment Variables:
```env
PORT=8080                              # Server port
GOOGLE_CLOUD_PROJECT=your-project-id   # GCP project
GOOGLE_CLOUD_LOCATION=asia-southeast1   # GCP region
LINE_CHANNEL_ACCESS_TOKEN=...          # Your LINE token
LINE_CHANNEL_SECRET=...                # Your LINE secret
ADMIN_USER_ID=...                      # Your LINE user ID (for reports)
LINE_AGENT_NAME=น้องโซระ               # Name shown by the LINE AI agent
```

### Get ADMIN_USER_ID:
1. Send any message to the bot
2. Check console logs: `📩 Message from userId: U...`
3. Copy that ID to `.env` as `ADMIN_USER_ID`

---

## 🔧 Project Architecture

```
Request → Express Server
        ↓
    Webhook Handler (LINE)
        ↓
    Intent Classification (Vertex AI)
        ↓
    Chat Engine (Gemini + Tools)
        ↓
    Database Operations (Firestore)
        ↓
    Response to LINE User
```

---

## 📊 Core Features

| Feature | File | Status |
|---------|------|--------|
| Message Handling | `line/webhook.ts` | ✅ |
| AI Chat | `services/chat.ts` | ✅ |
| Daily Reports | `jobs/daily-report.ts` | ✅ |
| User Segmentation | `jobs/segmentation.ts` | ✅ |
| Intent Recognition | `services/vertexai.ts` | ✅ |
| User Tracking | `services/firestore.ts` | ✅ |
| Analytics | `services/bigquery.ts` | ✅ |

---

## 🐛 Troubleshooting

### "GOOGLE_CLOUD_PROJECT not set"
→ Set it in `.env` and it will use Google Cloud services

### "LINE credentials missing"
→ Webhook runs in demo mode (returns mock responses)

### "Port already in use"
→ Change `PORT` in `.env` or kill existing process

### TypeScript errors after editing
→ Run `npm run build` to check for errors

---

## 📈 Next Steps

1. **Set up Google Cloud Project**
   - Enable Firestore, BigQuery, Vertex AI APIs
   - Set `GOOGLE_CLOUD_PROJECT` in `.env`

2. **Configure LINE Bot**
   - Add webhook URL from Cloud Run
   - Set channel access token and secret

3. **Load Odoo Demo Data**
   - Send `DEMO SEED ODOO` in LINE chat
   - Or call `POST /jobs/seed-odoo`

4. **Deploy to Cloud Run**
   ```bash
   ./deploy.sh
   ```

   Or use the free Cloudflare Tunnel path:
   ```bash
   ./deploy-cloudflare.sh
   ```

   Then copy the public HTTPS URL printed by `cloudflared` and set your LINE webhook to:
   ```text
   https://YOUR-CLOUDFLARED-URL/webhook
   ```

5. **Monitor Logs**
   ```bash
   gcloud run logs read line-oa-commerce-agent --limit 50
   ```

---

## 📞 Support

For issues with:
- **LINE Bot SDK**: https://developers.line.biz/en/docs/
- **Vertex AI**: https://cloud.google.com/vertex-ai/docs
- **Firestore**: https://firebase.google.com/docs/firestore
- **BigQuery**: https://cloud.google.com/bigquery/docs

---

## ✨ You're All Set!

Your project is **built, configured, and ready to deploy**. 

Start with `npm run dev` for development or `./deploy.sh` for production! 🎉
