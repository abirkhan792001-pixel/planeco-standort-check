import 'server-only';

export type Mail = { to: { email: string; name?: string }; subject: string; html?: string; text: string; tags?: string[] };

export async function sendTransactional(mail: Mail): Promise<{ messageId: string }> {
  const key = process.env.BREVO_API_KEY;
  const senderEmail = process.env.MAIL_SENDER_EMAIL;
  if (!key || !senderEmail) throw new Error('Brevo env vars missing');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_SENDER_NAME ?? 'Standort-Check', email: senderEmail },
      to: [mail.to],
      replyTo: process.env.MAIL_REPLY_TO ? { email: process.env.MAIL_REPLY_TO } : undefined,
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: mail.tags,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { messageId?: string };
  return { messageId: json.messageId ?? '' };
}
