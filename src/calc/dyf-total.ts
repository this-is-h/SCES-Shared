/**
 * 德育分总分计算（迁移预览版 totalScore.js 已验证逻辑）。
 * 规则：惩罚分类目（penalty 分类）小计取负；负分项目（negative 条目）单项取负。
 *
 * 标记驱动（决策 #36）：penalty 分类 code 与 negative 条目 code 由**单位配置的布尔标记**
 * 决定（见 extractDyfTotalConfig 从 UnitConfig 提取），不再按中文分类名或魔法编号硬编码。
 * 未提供 config 时不识别任何 penalty/negative（全部按正向累加）——调用方须显式传入。
 */

import type { TakeHighestScope, UnitConfig } from "../types";
import { nz, opt } from "../nullish";

/** 单项明细。categoryCode 为分类 code（决策 #36：dyf_score.category 存 code）。 */
export interface ScoreDetail {
  categoryCode: string;
  itemNumber: string;
  score: number;
}

/** 德育分总分计算配置（penalty 分类 code 列表 + negative 条目 code 列表）。 */
export interface DyfTotalConfig {
  /** 惩罚分类别 code（小计取负）。 */
  penaltyCategoryCodes?: string[];
  /** 负分项目条目 code（单项取负）。 */
  negativeItemNumbers?: string[];
  /** itemCode -> 取最高分族 key，由配置模板展开，避免管理端丢失组信息。 */
  takeHighestItemKeys?: Record<string, string>;
}

const normalizeStringList = (list: string[] | undefined): string[] =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((v) => String(nz(v, "")).trim())
        .filter(Boolean),
    ),
  );

/** 解析总分计算配置：未配置项回退为空（标记驱动，无默认惩罚分类/负分项目）。 */
export function resolveDyfTotalConfig(
  config?: DyfTotalConfig,
): Required<DyfTotalConfig> {
  return {
    penaltyCategoryCodes: normalizeStringList(
      opt(config, "penaltyCategoryCodes"),
    ),
    negativeItemNumbers: normalizeStringList(
      opt(config, "negativeItemNumbers"),
    ),
    takeHighestItemKeys: (() => {
      const keys = opt(config, "takeHighestItemKeys");
      return keys && typeof keys === "object" ? { ...keys } : {};
    })(),
  };
}

/**
 * 从单位配置提取总分计算标记（决策 #36）：
 * - penaltyCategoryCodes = dyf.categories 中 penalty=true 的分类 code；
 * - negativeItemNumbers  = dyf 树中 negative=true 的条目 code。
 */
export function extractDyfTotalConfig(
  config: UnitConfig | null | undefined,
): DyfTotalConfig {
  const penaltyCategoryCodes: string[] = [];
  const negativeItemNumbers: string[] = [];
  const takeHighestItemKeys: Record<string, string> = {};
  const dyf = opt(config, "dyf");
  const categories = opt(dyf, "categories");
  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (category.penalty === true && category.code) {
        penaltyCategoryCodes.push(String(category.code));
      }
      const groups = opt(category, "groups");
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        const takeHighest = category.takeHighest || group.takeHighest;
        const items = opt(group, "items");
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (item.negative === true && item.code) {
            negativeItemNumbers.push(String(item.code));
          }
          if (takeHighest && item.code) {
            const scope = takeHighest.scope as TakeHighestScope;
            const code = String(item.code);
            if (scope === "category")
              takeHighestItemKeys[code] = `cat:${category.code}`;
            else if (scope === "group")
              takeHighestItemKeys[code] = `grp:${category.code}/${group.code}`;
            else {
              const n =
                typeof takeHighest.prefixLength === "number" &&
                takeHighest.prefixLength > 0
                  ? takeHighest.prefixLength
                  : 0;
              takeHighestItemKeys[code] =
                `pre:${category.code}/${code.slice(0, n)}`;
            }
          }
        }
      }
    }
  }
  const result: DyfTotalConfig = {
    penaltyCategoryCodes: normalizeStringList(penaltyCategoryCodes),
    negativeItemNumbers: normalizeStringList(negativeItemNumbers),
  };
  if (Object.keys(takeHighestItemKeys).length > 0)
    result.takeHighestItemKeys = takeHighestItemKeys;
  return result;
}

/** 计算德育分总分。 */
export function calcDyfTotal(
  details: ScoreDetail[],
  config?: DyfTotalConfig,
): number {
  const { penaltyCategoryCodes, negativeItemNumbers, takeHighestItemKeys } =
    resolveDyfTotalConfig(config);
  const penaltyCategorySet = new Set(penaltyCategoryCodes);
  const negativeItemSet = new Set(negativeItemNumbers);
  const categorySubtotalMap = new Map<string, number>();
  const familyMax = new Map<string, number>();
  const familyWinner = new Map<string, string>();
  const familyDetails: Array<{
    categoryCode: string;
    itemNumber: string;
    signedScore: number;
    familyKey?: string;
  }> = [];

  for (const detail of Array.isArray(details) ? details : []) {
    const categoryCode = String(nz(opt(detail, "categoryCode"), ""));
    const itemNumber = String(nz(opt(detail, "itemNumber"), ""));
    const score = Number(nz(opt(detail, "score"), 0));
    if (!Number.isFinite(score) || !categoryCode) continue;
    const signedScore = negativeItemSet.has(itemNumber) ? -score : score;
    const familyKey = takeHighestItemKeys[itemNumber];
    familyDetails.push({ categoryCode, itemNumber, signedScore, familyKey });
    if (
      familyKey &&
      (!familyMax.has(familyKey) || score > familyMax.get(familyKey)!)
    ) {
      familyMax.set(familyKey, score);
      familyWinner.set(familyKey, itemNumber);
    }
  }

  for (const detail of familyDetails) {
    if (detail.familyKey) {
      if (familyWinner.get(detail.familyKey) !== detail.itemNumber) continue;
    }
    categorySubtotalMap.set(
      detail.categoryCode,
      nz(categorySubtotalMap.get(detail.categoryCode), 0) + detail.signedScore,
    );
  }

  let total = 0;
  for (const [categoryCode, subtotal] of categorySubtotalMap.entries()) {
    total += penaltyCategorySet.has(categoryCode) ? -subtotal : subtotal;
  }
  return Number(total.toFixed(2));
}
