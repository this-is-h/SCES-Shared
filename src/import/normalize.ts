/**
 * 导入明细归一化：将 .dyf payload 中的 dyf 明细映射为可落库的德育分明细。
 * category / allowAdd / maxScore 从单位配置解析（三端共享同一配置，itemCode 一致），
 * 配置未定义的项目保留导入、类别标为「未知」，由审核端人工核对，避免静默丢弃学生数据。
 */
import type { ScoreType, UnitConfig } from "../types";
import type { ImportPayload } from "../types/import";
import { nz, opt } from "../nullish";
import { isStudentApplicableItem } from "../validate/score";

/**
 * 从 scoreType 推导分值上限（UnitConfig：上限在 scoreType，**不再是旧 DyfItem.support**）：
 * - stepper / input：取 `max`（缺省表示无上限 → undefined）；
 * - radio：取候选 options 里最大的 value。
 */
export function maxScoreOf(
  scoreType: ScoreType | undefined,
): number | undefined {
  if (!scoreType || typeof scoreType !== "object") return undefined;
  if (scoreType.type === "radio") {
    const values = (Array.isArray(scoreType.options) ? scoreType.options : [])
      .map((o) => Number(opt(o, "value")))
      .filter((v) => Number.isFinite(v));
    return values.length ? Math.max(...values) : undefined;
  }
  // stepper / input
  const max = (scoreType as { max?: unknown }).max;
  return typeof max === "number" && Number.isFinite(max) ? max : undefined;
}

/**
 * 从 scoreType 提取输入精度（三端一致的步长/小数位约束）：
 * - stepper：step 用配置值，decimals 用配置值（缺省 0）；
 * - input：无步长概念，step 由 decimals 推导为 10^-decimals（decimals=0 → 1）；
 * - radio：候选为离散值，step/decimals 由候选值的最大小数位推导，保证任一候选可精确表示。
 * decimals 夹在 0~2（schema 约束）。
 */
export function scorePrecisionOf(scoreType: ScoreType | undefined): {
  step: number;
  decimals: number;
} {
  if (!scoreType || typeof scoreType !== "object")
    return { step: 1, decimals: 0 };
  if (scoreType.type === "radio") {
    const values = (Array.isArray(scoreType.options) ? scoreType.options : [])
      .map((o) => Number(opt(o, "value")))
      .filter((v) => Number.isFinite(v));
    const decimals = clampDecimals(Math.max(0, ...values.map(fractionDigits)));
    return { step: stepFromDecimals(decimals), decimals };
  }
  const st = scoreType as { step?: unknown; decimals?: unknown };
  const decimals = clampDecimals(
    typeof st.decimals === "number" ? st.decimals : 0,
  );
  const step =
    typeof st.step === "number" && Number.isFinite(st.step) && st.step > 0
      ? st.step
      : stepFromDecimals(decimals);
  return { step, decimals };
}

/** 小数位数夹到 schema 允许的 0~2。 */
function clampDecimals(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(2, Math.floor(n));
}

/** 数字的小数位数（radio 候选值精度推导用）。 */
function fractionDigits(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** 由小数位推导步长：decimals=0 → 1，1 → 0.1，2 → 0.01。 */
function stepFromDecimals(decimals: number): number {
  return decimals > 0 ? Number((10 ** -decimals).toFixed(decimals)) : 1;
}

/** 归一化后的德育分明细（对应 dyf_score 行）。 */
export interface NormalizedImportScore {
  /** 项目编号。 */
  itemCode: string;
  /** 分类 code（决策 #36；模板未定义时为「未知」）。 */
  category: string;
  /** 学生申请分。 */
  appliedScore: number;
  /** 证明材料 base64 数组（管理端落盘后替换为文件路径）。 */
  evidence: string[];
  evidenceRefs?: string[];
  /** 是否允许加分。 */
  allowAdd: boolean;
  /** 分值上限（来自 scoreType：stepper/input 的 max、radio 的最大 option value）。 */
  maxScore?: number;
}

/** 归一化结果。 */
export interface NormalizeImportResult {
  /** 可入库的明细。 */
  scores: NormalizedImportScore[];
  /** 未在模板中定义的项目编号（保留导入，审核端人工核对）。 */
  unknownItems: string[];
}

interface ItemConfig {
  /** 分类 code（决策 #36：dyf_score.category 存 code）。 */
  category: string;
  allowAdd: boolean;
  maxScore?: number;
  /** 是否学生端可申请（加分限制仅对学生申请项生效）。 */
  studentApplicable: boolean;
}

/** 从单位配置查找项目配置（分类 code / 是否允许加分 / 上限）。 */
export function findTemplateItem(
  template: UnitConfig,
  itemCode: string,
): ItemConfig | null {
  const dyf = opt(template, "dyf");
  const categories = opt(dyf, "categories");
  if (!Array.isArray(categories)) return null;
  for (const category of categories) {
    const groups = opt(category, "groups");
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const items = opt(group, "items");
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.code === itemCode) {
          return {
            category: category.code,
            allowAdd: item.allowAdd === true,
            maxScore: maxScoreOf(item.scoreType),
            studentApplicable: isStudentApplicableItem(item, category.name),
          };
        }
      }
    }
  }
  return null;
}

/** 将 .dyf payload 的 dyf 明细归一化为可入库结构。 */
export function normalizeImportDyf(
  payload: ImportPayload,
  template: UnitConfig,
): NormalizeImportResult {
  const scores: NormalizedImportScore[] = [];
  const unknownItems: string[] = [];
  const dyfRaw = opt(payload, "dyf");
  const dyf =
    dyfRaw && typeof dyfRaw === "object" && !Array.isArray(dyfRaw)
      ? (dyfRaw as Record<string, unknown>)
      : {};

  for (const itemCode of Object.keys(dyf)) {
    const entry = dyf[itemCode];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const appliedScore = Number(nz(opt(record, "score"), 0));
    if (!Number.isFinite(appliedScore)) continue;
    const evidenceRaw = opt(record, "evidence");
    const evidence = Array.isArray(evidenceRaw)
      ? evidenceRaw.map((v) => String(nz(v, ""))).filter(Boolean)
      : [];
    const evidenceRefsRaw = opt(record, "evidenceRefs");
    const evidenceRefs = Array.isArray(evidenceRefsRaw)
      ? evidenceRefsRaw.map((v) => String(nz(v, ""))).filter(Boolean)
      : [];

    const found = findTemplateItem(template, itemCode);
    if (!found) {
      unknownItems.push(itemCode);
      scores.push({
        itemCode,
        category: "未知",
        appliedScore,
        evidence,
        ...(evidenceRefs.length ? { evidenceRefs } : {}),
        allowAdd: false,
      });
      continue;
    }
    scores.push({
      itemCode,
      category: found.category,
      appliedScore,
      evidence,
      ...(evidenceRefs.length ? { evidenceRefs } : {}),
      allowAdd: found.allowAdd,
      maxScore: found.maxScore,
    });
  }
  return { scores, unknownItems };
}
