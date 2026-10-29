import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const payload = await req.json() // from forwardemail.net / mailgun

  // expected: { to: "ingest-abc123@domain", from: "customer@...", subject: "...", text: "..." }
  const to = payload.to || payload.recipient || ""
  const token = to.match(/ingest-([a-z0-9]+)@/i)?.[1]
  if (!token) return new Response("no token", { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("user_id").eq("ingest_token", token).single()
  if (!profile) return new Response("unknown inbox", { status: 404 })

  // score via internal function
  const scoreRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/score`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: payload.subject, body: payload.text || payload["body-plain"], customer_email: payload.from })
  })
  const scored = await scoreRes.json()

  await supabase.from("tickets").insert({
    user_id: profile.user_id,
    customer_email: payload.from,
    subject: payload.subject,
    body: payload.text || payload["body-plain"],
    risk: scored.risk,
    reason: scored.reason,
    summary: scored.summary,
    score: scored.score
  })

  return new Response(JSON.stringify({ ok: true, scored }), { headers: { "Content-Type": "application/json" } })
})
