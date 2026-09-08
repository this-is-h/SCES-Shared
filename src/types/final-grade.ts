/** 综测结果：德育分总分、课程成绩总分、综测总分、各范围排名。 */
export interface FinalGrade {
    /** 数据库自增 id（管理端本地）。 */
    id?: number
    batchId: string
    /** 学号。 */
    studentId: string
    /** 德育分总分。 */
    dyfTotal: number
    /** 课程成绩总分。 */
    courseTotal?: number
    /** 综测总分。 */
    finalTotal: number
    /** 班级排名。 */
    rankClass?: number
    /** 专业排名（同年级同专业）。 */
    rankMajor?: number
    /** 年级排名。 */
    rankGrade?: number
    /** 全校排名（可选）。 */
    rankSchool?: number
}