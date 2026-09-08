import type { ApplyStatus } from "../types";
import { nz } from "../nullish";

/** 德育分状态机：draft → submitted → reviewing → confirmed；imported 仅兼容旧客户端。 */
export const APPLY_STATES = [
  "draft",
  "submitted",
  "imported",
  "reviewing",
  "confirmed",
] as const;
export type ApplyState = (typeof APPLY_STATES)[number];

/**
 * 合法迁移表。
 * - submitted → submitted：学生可重新导出，生成新 revision；当前管理端导入直接进入 reviewing。
 * - imported → reviewing：仅兼容旧客户端/旧服务端状态。
 * - 其余单向推进，不允许回退。
 */
export const APPLY_TRANSITIONS: Record<ApplyState, readonly ApplyState[]> = {
  draft: ["submitted"],
  submitted: ["submitted", "reviewing", "imported"],
  imported: ["reviewing"],
  reviewing: ["confirmed"],
  confirmed: [],
};

/** 判断状态迁移是否合法。 */
export function canTransition(from: ApplyState, to: ApplyState): boolean {
  return nz(APPLY_TRANSITIONS[from], []).includes(to);
}

/** 断言状态迁移合法，非法时抛错。 */
export function assertTransition(from: ApplyState, to: ApplyState): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态迁移：${from} → ${to}`);
  }
}

/** 返回某状态可迁移到的所有目标状态。 */
export function nextStates(from: ApplyState): readonly ApplyState[] {
  return nz(APPLY_TRANSITIONS[from], []);
}

/** 类型守卫：判断字符串是否为合法申请状态。 */
export function isApplyState(value: unknown): value is ApplyState {
  return (
    typeof value === "string" &&
    (APPLY_STATES as readonly string[]).includes(value)
  );
}

export type { ApplyStatus };
