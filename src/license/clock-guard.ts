/**
 * 时钟回拨判定（纯函数，便于单测；dual-mode/03 §6）。
 * 与 IO 解耦：management 的 `guardClock` 负责读写水位，判定逻辑收在这里。
 */

/**
 * @param now         当前时间（epoch ms）
 * @param highWater   本机记录的最近使用时间（单调水位）
 * @param toleranceMs 容差（覆盖时区/NTP/夏令时校正）
 * @returns rolledBack=时钟被调回超过容差；nextHighWater=推进后的水位（未推进则不变）
 */
export function decideClockGuard(
    now: number,
    highWater: number,
    toleranceMs: number,
): { rolledBack: boolean; nextHighWater: number } {
    if (now > highWater) return { rolledBack: false, nextHighWater: now }
    if (highWater - now > toleranceMs) return { rolledBack: true, nextHighWater: highWater }
    return { rolledBack: false, nextHighWater: highWater }
}
