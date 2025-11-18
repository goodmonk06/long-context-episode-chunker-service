// Notification adapter for sending alerts on events

export interface NotificationPayload {
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}

export interface INotificationAdapter {
  sendNotification(payload: NotificationPayload): Promise<void>;
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendWebhook(url: string, payload: Record<string, unknown>): Promise<void>;
}

// No-op implementation (default)
export class NoOpNotificationAdapter implements INotificationAdapter {
  async sendNotification(payload: NotificationPayload): Promise<void> {
    console.log('[NoOp Notification]', payload.title, payload.message);
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log('[NoOp Email]', `To: ${to}, Subject: ${subject}`);
  }

  async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    console.log('[NoOp Webhook]', `URL: ${url}`, payload);
  }
}

// Console logger implementation (for development)
export class ConsoleNotificationAdapter implements INotificationAdapter {
  async sendNotification(payload: NotificationPayload): Promise<void> {
    console.log('=== NOTIFICATION ===');
    console.log(`Title: ${payload.title}`);
    console.log(`Message: ${payload.message}`);
    console.log(`Priority: ${payload.priority || 'normal'}`);
    if (payload.data) {
      console.log('Data:', JSON.stringify(payload.data, null, 2));
    }
    console.log('===================');
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log('=== EMAIL ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    console.log('=============');
  }

  async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    console.log('=== WEBHOOK ===');
    console.log(`URL: ${url}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('===============');
  }
}

// Webhook implementation (for production)
export class WebhookNotificationAdapter implements INotificationAdapter {
  constructor(private defaultWebhookUrl?: string) {}

  async sendNotification(payload: NotificationPayload): Promise<void> {
    if (!this.defaultWebhookUrl) {
      throw new Error('No webhook URL configured');
    }

    await this.sendWebhook(this.defaultWebhookUrl, {
      type: 'notification',
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // In a real implementation, this would use an email service
    console.log('[Webhook Email] Not implemented - would send via email service');
  }

  async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Webhook Error]', error);
      throw error;
    }
  }
}

// Global notification adapter
let notificationAdapter: INotificationAdapter = new NoOpNotificationAdapter();

export function setNotificationAdapter(adapter: INotificationAdapter) {
  notificationAdapter = adapter;
}

export function getNotificationAdapter(): INotificationAdapter {
  return notificationAdapter;
}

// Convenience functions
export async function sendNotification(payload: NotificationPayload) {
  await notificationAdapter.sendNotification(payload);
}

export async function sendEmail(to: string, subject: string, body: string) {
  await notificationAdapter.sendEmail(to, subject, body);
}

export async function sendWebhook(url: string, payload: Record<string, unknown>) {
  await notificationAdapter.sendWebhook(url, payload);
}
