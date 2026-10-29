#!/bin/bash
# run from this folder
supabase functions deploy score --no-verify-jwt
supabase functions deploy ingest --no-verify-jwt
supabase functions deploy stripe --no-verify-jwt

# set secrets
supabase secrets set OLLAMA_URL=https://your-ollama.fly.dev/api/generate OLLAMA_MODEL=llama3.2:3b STRIPE_SECRET=sk_... STRIPE_PRICE_ID=price_... STRIPE_WEBHOOK_SECRET=whsec_... RESEND_API_KEY=re_... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...

# schedule weekly digest (in supabase SQL editor)
# select cron.schedule('churn-digest','0 9 * * 1', $$ select net.http_get('https://<project>.supabase.co/functions/v1/stripe?action=digest-cron', headers:='{"Authorization":"Bearer <service_role>"}'::jsonb) $$);
echo "deployed"
