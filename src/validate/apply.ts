import type { ValidationResult } from "../types";
import { nz, opt } from "../nullish";

/** 申请 payload（.dyf 文件解密后的内容）。 */
export interface ApplyPayload {
  applyId?: unknown;
  batchId?: unknown;
  revision?: unknown;
  personal?: Record<string, unknown>;
  dyf?: unknown;
  confirmSlip?: unknown;
  confirmSlipRef?: unknown;
  exportedAt?: unknown;
}

/** 申请校验选项。 */
export interface ApplyValidationOptions {
  /** 必填个人信息字段（默认 name/studentId）。 */
  requiredPersonalFields?: string[];
  /** 管理端导入时要求 dyf 字段存在；默认保持历史最小 payload 兼容。 */
  requireDyf?: boolean;
}

const DEFAULT_REQUIRED_PERSONAL_FIELDS = ["name", "studentId"];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isBase64(value: string): boolean {
  return value.length % 4 !== 1 && BASE64_RE.test(value);
}

/** 校验申请 payload 必填项。 */
export function validateApplyPayload(
  payload: ApplyPayload,
  options?: ApplyValidationOptions,
): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["申请内容为空"] };
  }

  if (typeof payload.applyId !== "string" || !payload.applyId.trim()) {
    errors.push("applyId 不能为空");
  }
  if (typeof payload.batchId !== "string" || !payload.batchId.trim()) {
    errors.push("batchId 不能为空");
  }
  if (
    typeof payload.revision !== "number" ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1
  ) {
    errors.push("revision 必须为正整数");
  }

  const required = nz(
    opt(options, "requiredPersonalFields"),
    DEFAULT_REQUIRED_PERSONAL_FIELDS,
  );
  const personal = payload.personal;
  if (!personal || typeof personal !== "object") {
    errors.push("个人信息不能为空");
  } else {
    for (const field of required) {
      const value = personal[field];
      if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) {
        errors.push(`个人信息缺少必填字段：${field}`);
      }
    }
  }

  const dyf = payload.dyf;
  if (dyf === undefined && opt(options, "requireDyf") === true) {
    errors.push("德育分明细不能为空");
  } else if (dyf !== undefined) {
    if (!dyf || typeof dyf !== "object" || Array.isArray(dyf)) {
      errors.push("德育分明细格式无效");
    } else {
      for (const [itemCode, raw] of Object.entries(
        dyf as Record<string, unknown>,
      )) {
        if (!/^\d+$/.test(itemCode)) {
          errors.push(`德育分项目编号无效：${itemCode}`);
          continue;
        }
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          errors.push(`德育分项目 ${itemCode} 格式无效`);
          continue;
        }
        const entry = raw as Record<string, unknown>;
        const score = entry.score;
        if (typeof score !== "number" || !Number.isFinite(score) || score < 0) {
          errors.push(`德育分项目 ${itemCode} 的分数无效`);
        }
        if (entry.evidence !== undefined) {
          if (
            !Array.isArray(entry.evidence) ||
            entry.evidence.some(
              (v) => typeof v !== "string" || !v || !isBase64(v),
            )
          ) {
            errors.push(`德育分项目 ${itemCode} 的证明材料格式无效`);
          }
        }
        if (
          entry.evidenceRefs !== undefined &&
          (!Array.isArray(entry.evidenceRefs) ||
            entry.evidenceRefs.some(
              (v) => typeof v !== "string" || !/^sha256:[0-9a-f]{64}$/.test(v),
            ))
        ) {
          errors.push(`德育分项目 ${itemCode} 的资产引用格式无效`);
        }
      }
    }
  }

  if (
    payload.confirmSlip !== undefined &&
    (typeof payload.confirmSlip !== "string" || !payload.confirmSlip)
  ) {
    errors.push("确认单格式无效");
  }
  if (
    payload.confirmSlipRef !== undefined &&
    (typeof payload.confirmSlipRef !== "string" || !/^sha256:[0-9a-f]{64}$/.test(payload.confirmSlipRef))
  ) {
    errors.push("确认单资产引用格式无效");
  }
  if (
    payload.exportedAt !== undefined &&
    (typeof payload.exportedAt !== "number" ||
      !Number.isFinite(payload.exportedAt))
  ) {
    errors.push("导出时间格式无效");
  }

  return { ok: errors.length === 0, errors };
}
