// Free IMAP poll fallback if you don't want inbound webhook
// npm i imapflow mailparser
import { ImapFlow } from 'imapflow'; import { simpleParser } from 'mailparser';
const client = new ImapFlow({ host: process.env.IMAP_HOST, port: 993, secure: true, auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS } });
await client.connect(); await client.mailboxOpen('INBOX');
for await (let msg of client.fetch('1:*', { envelope: true, source: true })) {
  if (!msg.source) continue;
  const parsed = await simpleParser(msg.source);
  // forward to supabase ingest function
  await fetch(`${process.env.SUPABASE_URL}/functions/v1/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: parsed.to?.text, from: parsed.from?.text, subject: parsed.subject, text: parsed.text }) });
}
await client.logout();
