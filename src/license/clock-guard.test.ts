import { describe, expect, it } from 'vitest'
import { decideClockGuard } from './clock-guard'

describe('decideClockGuard', () => {
    it('now 晚于水位 → 推进水位，不判回拨', () => {
        expect(decideClockGuard(2000, 1000, 500)).toEqual({ rolledBack: false, nextHighWater: 2000 })
    })

    it('now 早于水位但在容差内 → 不误判，不推进', () => {
        expect(decideClockGuard(900, 1000, 500)).toEqual({ rolledBack: false, nextHighWater: 1000 })
    })

    it('now 早于水位恰好等于容差边界 → 不误判（严格大于才算回拨）', () => {
        expect(decideClockGuard(500, 1000, 500)).toEqual({ rolledBack: false, nextHighWater: 1000 })
    })

    it('now 早于水位超过容差 → 判回拨，不推进', () => {
        expect(decideClockGuard(400, 1000, 500)).toEqual({ rolledBack: true, nextHighWater: 1000 })
    })

    it('now 等于水位 → 不推进不回拨', () => {
        expect(decideClockGuard(1000, 1000, 500)).toEqual({ rolledBack: false, nextHighWater: 1000 })
    })
})
