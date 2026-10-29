import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Stripe from "https://esm.sh/stripe@14.0.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET")!, { apiVersion: "2023-10-16" })
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  if (action === "checkout") {
    const { user_id, email } = await req.json()
    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      mode: "subscription",
      success_url: `${req.headers.get("origin")}/?success=1`,
      cancel_url: `${req.headers.get("origin")}/?cancel=1`,
      metadata: { user_id }
    })
    return new Response(JSON.stringify({ url: session.url }), { headers: { "Content-Type": "application/json" } })
  }

  if (action === "webhook") {
    const sig = req.headers.get("stripe-signature")!
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!)
    if (event.type === "checkout.session.completed") {
      const user_id = event.data.object.metadata.user_id
      const customer = event.data.object.customer as string
      await supabase.from("profiles").update({ tier: "pro", stripe_customer_id: customer }).eq("user_id", user_id)
    }
    if (event.type === "customer.subscription.deleted") {
      const customer = event.data.object.customer as string
      await supabase.from("profiles").update({ tier: "free" }).eq("stripe_customer_id", customer)
    }
    return new Response("ok")
  }

  if (action === "digest-cron") {
    // Called by pg_cron weekly: SELECT cron.schedule('weekly-digest','0 9 * * 1', $$SELECT net.http_post(...)$$)
    const { data: users } = await supabase.from("profiles").select("user_id").eq("tier","pro")
    for (const u of users || []) {
      const { data: tickets } = await supabase.from("tickets").select("*").eq("user_id", u.user_id).gte("created_at", new Date(Date.now()-7*864e5).toISOString()).eq("risk","high")
      if (!tickets?.length) continue
      const { data: authUser } = await supabase.auth.admin.getUserById(u.user_id)
      const email = authUser?.user?.email
      if (!email) continue

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "ChurnWhisper <digest@churnwhisper.com>",
          to: email,
          subject: `ChurnWhisper: ${tickets.length} at-risk customers this week`,
          html: `<h2>${tickets.length} high-risk tickets</h2><ul>${tickets.map(t=>`<li><b>${t.customer_email}</b> - ${t.reason}: ${t.summary}</li>`).join("")}</ul><p>Top reason: ${tickets.reduce((a,b)=>a,'')}</p>`
        })
      })
    }
    return new Response("digests sent")
  }

  return new Response("unknown action", { status: 400 })
})
