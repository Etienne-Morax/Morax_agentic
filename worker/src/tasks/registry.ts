/**
 * Morax worker - registre des taches Launchpad. Point d'extension unique :
 * chaque bouton ajoute son handler dans son propre fichier (worker/src/tasks/<nom>.ts)
 * sans jamais toucher run.ts, ce qui permet a plusieurs agents de les livrer
 * en parallele sans conflit de fusion.
 */

import type { JobType } from '@morax/model-core'
import { chaseUnpaid } from './chase-unpaid.js'
import { checkDeadlines } from './check-deadlines.js'
import { commandReply } from './command-reply.js'
import { dailySummary } from './daily-summary.js'
import { sortInbox } from './sort-inbox.js'
import type { TaskContext } from './types.js'

export type TaskHandler = (ctx: TaskContext) => Promise<void>

export const TASK_HANDLERS: Partial<Record<JobType, TaskHandler>> = {
  chase_unpaid: chaseUnpaid,
  check_deadlines: checkDeadlines,
  daily_summary: dailySummary,
  sort_inbox: sortInbox,
  command_reply: commandReply,
}
