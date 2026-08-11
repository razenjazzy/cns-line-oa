#!/bin/bash
# Exit on error
set -e

# Load environment variables from .env file if present
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"YOUR_PROJECT_ID"}
REGION=${GOOGLE_CLOUD_LOCATION:-"asia-southeast1"}
SERVICE_NAME="line-oa-commerce-agent"

echo "Deploying to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"

gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="LINE_CHANNEL_ACCESS_TOKEN=$LINE_CHANNEL_ACCESS_TOKEN,LINE_CHANNEL_SECRET=$LINE_CHANNEL_SECRET,ADMIN_USER_ID=$ADMIN_USER_ID,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_AI_STUDIO_API_KEY=$GOOGLE_AI_STUDIO_API_KEY,ODOO_URL=$ODOO_URL,ODOO_DB=$ODOO_DB,ODOO_USERNAME=$ODOO_USERNAME,ODOO_API_KEY=$ODOO_API_KEY"

echo "Deployment complete! Don't forget to update your Webhook URL in the LINE Developer Console with the new Cloud Run URL."
