/** 课程成绩：管理端上传（Excel 导入 + 手动修正）。 */
export interface CourseScore {
    /** 数据库自增 id（管理端本地）。 */
    id?: number
    batchId: string
    /** 学号。 */
    studentId: string
    courseName: string
    score: number
    /** 学分（可选）。 */
    credit?: number
}