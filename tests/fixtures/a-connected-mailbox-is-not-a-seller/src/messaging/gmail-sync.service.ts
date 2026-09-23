import { google } from 'googleapis';
import { ConnectedAccountRepository } from './connected-account.repository';

export class GmailSyncService {
  constructor(private readonly connectedAccounts: ConnectedAccountRepository) {}

  async sync(workspaceId: string, connectedAccountId: string) {
    const connectedAccount = await this.connectedAccounts.findOne(workspaceId, connectedAccountId);
    const gmail = google.gmail({ version: 'v1', auth: connectedAccount.oauthClient() });
    return gmail.users.messages.list({ userId: 'me' });
  }
}
