import type { PersistentAccount } from "../persistence/account";
import { PersistentPeopleService } from "../persistence/people";
import { issueSignalingSession, type IssuedSignalingSession } from "./capabilities.server";

const opaqueAccountId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SignalSessionAuthorizationError extends Error {
  constructor() {
    super("SIGNAL_SESSION_UNAVAILABLE");
  }
}

/**
 * Account and People eligibility are checked only before a sender capability is issued. The
 * resulting receiver bearer capability authorizes signaling coordination only, never payload.
 */
export class ProductionSignalSessionService {
  constructor(private readonly people = new PersistentPeopleService()) {}

  async createForConnectedRecipient(
    account: PersistentAccount,
    recipientAccountId: string
  ): Promise<IssuedSignalingSession> {
    if (!opaqueAccountId.test(recipientAccountId)) throw new SignalSessionAuthorizationError();
    if (!(await this.people.isConnected(account, recipientAccountId)))
      throw new SignalSessionAuthorizationError();
    return issueSignalingSession();
  }
}
