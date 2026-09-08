/**
 * 导入模块：.dyf payload 类型与归一化。
 * 管理端导入（M3）与未来服务端在线提交（M7）共用，保证三端解析一致。
 */
export type { ImportPayload, ImportPersonal, ImportDyfEntry } from '../types/import'
export {
    normalizeImportDyf,
    findTemplateItem,
    maxScoreOf,
    scorePrecisionOf,
} from './normalize'
export type {
    NormalizedImportScore,
    NormalizeImportResult,
} from './normalize'
