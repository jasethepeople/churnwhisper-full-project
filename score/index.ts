import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  try {
    const { subject, body, customer_email } = await req.json()
    const OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://localhost:11434/api/generate"
    const MODEL = Deno.env.get("OLLAMA_MODEL") || "llama3.2:3b"

    const prompt = `You are ChurnWhisper, a churn risk classifier.
Analyze this support ticket and return ONLY valid JSON.

Ticket:
Subject: ${subject || 'n/a'}
Customer: ${customer_email || 'unknown'}
Body: ${body}

Rules:
- risk: low = mild complaint / question, medium = frustrated / asking alternatives, high = threatening to leave / angry / repeated issues
- reason: one of [pricing, bug, missing feature, support, competitor, other]
- summary: 12 words max, customer intent
- score: 0.0 to 1.0 churn probability

Return JSON: {"risk":"low|medium|high","reason":"pricing|bug|missing feature|support|competitor|other","summary":"...","score":0.85}`;

    let result
    try {
      const ollamaRes = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, prompt, stream: false, format: "json", options: { temperature: 0.2 } })
      })
      const data = await ollamaRes.json()
      result = JSON.parse(data.response)
    } catch (e) {
      console.log("Ollama failed, using heuristic", e)
      const b = (body + " " + subject).toLowerCase()
      let risk = "low", score = 0.2, reason = "other"
      if (b.match(/cancel|leaving|competitor|alternative|switching|refund/)) { risk = "high"; score = 0.85 }
      else if (b.match(/frustrated|angry|again|still|not working|broken|terrible/)) { risk = "medium"; score = 0.55 }
      if (b.match(/price|expensive|cheap/)) reason = "pricing"
      else if (b.match(/bug|crash|broken|error|not working/)) reason = "bug"
      else if (b.match(/feature|missing|need|wish|could you add/)) reason = "missing feature"
      else if (b.match(/support|response|waiting|no answer/)) reason = "support"
      result = { risk, reason, summary: body.slice(0,80), score }
    }

    return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors })
  }
})
