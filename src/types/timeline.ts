import type { AuditRole } from './audit-log'
import type { EpochMs } from './common'

export type TimelineActorType = 'student' | 'admin' | 'system'

export type TimelineAction =
  | 'student.entered'
  | 'student.exported'
  | 'admin.imported'
  | 'admin.modified'
  | 'admin.exported'
  | 'admin.confirmed'
  | 'admin.confirmation-revoked'

export interface TimelineEvent {
  eventId: string
  batchId: string
  applyId?: string
  actorType: TimelineActorType
  role?: AuditRole
  scope?: Record<string, unknown>
  action: TimelineAction
  occurredAt: EpochMs
  revision?: number
  sourceFileHash?: string
  detail?: Record<string, unknown>
  createdAt: EpochMs
}
