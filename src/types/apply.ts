import type { EpochMs } from "./common";

/** 申请状态：draft → submitted → reviewing → confirmed，imported 仅兼容旧客户端，单向推进。 */
export type ApplyStatus =
  "draft" | "submitted" | "imported" | "reviewing" | "confirmed";

/** 确认层级：3=班级 / 2=年级 / 1=校级。 */
export type ConfirmLevel = 1 | 2 | 3;

/** 申请：学生×批次的唯一实体，不随导出变化；每次导出生成一个快照（revision）。 */
export interface Apply {
  /** 申请唯一标识（学生×批次唯一，首次填写时生成）。 */
  applyId: string;
  batchId: string;
  /** 学号。 */
  studentId: string;
  status: ApplyStatus;
  /** 当前生效版本号。 */
  currentRevision: number;
  /** 确认层级。 */
  confirmLevel?: ConfirmLevel;
  /** 确认操作者。 */
  confirmBy?: string;
  /** 已导入文件的哈希（SHA-256）。 */
  fileHash?: string;
  importedAt?: EpochMs;
  firstEnteredAt?: EpochMs;
  lastStudentExportedAt?: EpochMs;
  lastImportedAt?: EpochMs;
  lastModifiedAt?: EpochMs;
  lastExportedAt?: EpochMs;
  dyfConfirmedAt?: EpochMs;
  finalAt?: EpochMs;
}
