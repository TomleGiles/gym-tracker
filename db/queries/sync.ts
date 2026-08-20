import { db } from '../client';
import { syncQueue } from '../schema';
import type { SyncOp } from '../schema';

type Runner = Pick<typeof db, 'insert'>;

/**
 * Journalise une mutation pour la sync V2 (§7). Rien ne la consomme en V1 —
 * c'est volontaire : le jour où le serveur existe, l'historique du delta est
 * déjà là et on s'épargne une migration rétroactive.
 */
export function queueOp(
  tx: Runner,
  entity: string,
  entityId: string,
  op: SyncOp,
  payload?: unknown,
): void {
  tx.insert(syncQueue)
    .values({
      entity,
      entityId,
      op,
      payload: payload === undefined ? null : JSON.stringify(payload),
    })
    .run();
}
