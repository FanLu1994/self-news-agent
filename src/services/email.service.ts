interface SendDigestEmailOptions {
  enabled: boolean;
  provider: 'resend';
  apiKey?: string;
  from?: string;
  to?: string;
  subject: string;
  text: string;
}

export class EmailService {
  async sendDigestEmail(options: SendDigestEmailOptions): Promise<boolean> {
    if (!options.enabled) return false;

    if (options.provider === 'resend') {
      if (!options.apiKey || !options.from || !options.to) {
        console.warn('Email skipped: RESEND_API_KEY / EMAIL_FROM / EMAIL_TO 未完整配置。');
        return false;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: options.from,
          to: [options.to],
          subject: options.subject,
          text: options.text
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend API ${response.status}: ${body}`);
      }

      return true;
    }

    return false;
  }
}

export const emailService = new EmailService();
