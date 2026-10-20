/**
 * 艺人类枚举（gender / type）的展示文案。
 *
 * 为什么收口到一处：这两张映射表此前在 pages/artist/detail.vue 和
 * components/SearchOverlay/index.vue 各写了一份，而且键的大小写并不一致 ——
 * detail.vue 用小写键（能匹配库里的 male/female），SearchOverlay 用大写键
 * （永远匹配不上，直接把原始值 "male"/"female" 原样渲染给用户）。
 * 于是同一份数据在详情页显示「女」、在搜索结果里显示「male」。
 *
 * 查表一律先 toLowerCase()：库里的值确实是小写，但入库路径不止后台表单一处，
 * 大小写不归一的表现是「静默退化成显示英文」，很难排查，所以在这里兜住。
 */

/** 性别。键统一小写 */
export const ARTIST_GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  character: "虚拟角色",
  mixed: "混合",
  other: "其他",
};

/** 类型。库里存的是首字母大写（Person/Group/...），这里也统一小写查 */
export const ARTIST_TYPE_LABEL: Record<string, string> = {
  person: "个人",
  group: "组合",
  orchestra: "管弦乐团",
  choir: "合唱团",
  character: "虚拟角色",
};

/** 空值返回空串；未知取值回退成原始值，至少不会显示成空白 */
export function artistGenderLabel(gender?: string): string {
  if (!gender) return "";
  return ARTIST_GENDER_LABEL[gender.toLowerCase()] || gender;
}

export function artistTypeLabel(type?: string): string {
  if (!type) return "";
  return ARTIST_TYPE_LABEL[type.toLowerCase()] || type;
}
