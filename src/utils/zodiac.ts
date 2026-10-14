// 星座工具:基于阳历生日推算星座
// 兼容 artist_detail.birthday 多种格式:
//   "1996-11-05" → 精确匹配 → 天蝎座
//   "1996-11"    → 仅有月份,用月初 → 天蝎座(忽略 10/23 这种月内转折)
//   "1996"       → 无月份 → 空串
//   ""/undefined → 空串

interface ZodiacRange {
  name: string
  // 范围起始月(1-12)与日(1-31)
  startMonth: number
  startDay: number
}

// 按起始日期顺序排列的 12 星座(摩羯跨年,放最后一段)
const RANGES: ZodiacRange[] = [
  { name: '水瓶座', startMonth: 1,  startDay: 20 },
  { name: '双鱼座', startMonth: 2,  startDay: 19 },
  { name: '白羊座', startMonth: 3,  startDay: 21 },
  { name: '金牛座', startMonth: 4,  startDay: 20 },
  { name: '双子座', startMonth: 5,  startDay: 21 },
  { name: '巨蟹座', startMonth: 6,  startDay: 22 },
  { name: '狮子座', startMonth: 7,  startDay: 23 },
  { name: '处女座', startMonth: 8,  startDay: 23 },
  { name: '天秤座', startMonth: 9,  startDay: 23 },
  { name: '天蝎座', startMonth: 10, startDay: 24 },
  { name: '射手座', startMonth: 11, startDay: 23 },
  { name: '摩羯座', startMonth: 12, startDay: 22 },
]

export function zodiacOf(birthday: string | undefined | null): string {
  if (!birthday) return ''
  const parts = birthday.split('-').map(s => parseInt(s, 10))
  const month = parts[0] && parts[1] ? parts[1] : 0
  if (!month || month < 1 || month > 12) return ''
  const day = (parts[2] && !isNaN(parts[2])) ? parts[2] : 1

  // 找到「起始 ≤ 当前」的最后一段(因数组按月排序,12 月跨到下年的摩羯单独处理)
  // 摩羯:12/22 - 1/19,所以 month=1 且 day<20 也算摩羯
  if (month === 1 && day < 20) return '摩羯座'
  for (let i = RANGES.length - 1; i >= 0; i--) {
    const r = RANGES[i]
    if (month > r.startMonth || (month === r.startMonth && day >= r.startDay)) {
      return r.name
    }
  }
  return ''
}
