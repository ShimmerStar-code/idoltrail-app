// 写入系统日历（App 端）。
//
// 为什么要做：订阅了活动之后，App 里只有一份「订阅列表」，
// 但用户真正需要的是「日历上有一场演出提醒我」。
// 没有这一层，订阅就只是 App 里的一个书签，用户没有回访理由 ——
// 「订阅完就卸载」的典型路径。
//
// 实现用 HTML5+ 的 plus.calendar：
//   · 写入的是**全天事件**（00:00:00 ~ 23:59:59）。
//     订阅数据（EventBrief）只有日期、没有具体开演时间，
//     臆造一个 19:00 会让用户的日历出现错误信息 —— 全天才不会骗人。
//   · 权限：Android 需要 WRITE_CALENDAR。权限在用户点「加入日历」时
//     才需要（应用市场红线：权限必须由用户主动触发才申请），
//     因此这里不主动弹权限框，失败时提示用户去系统设置授权。
//
// H5 / 小程序端不支持：直接 reject，调用方按「不支持」提示即可。

export interface CalendarEventInput {
  /** 日历标题 */
  title: string
  /** 开始日期 YYYY-MM-DD */
  startDate: string
  /** 结束日期 YYYY-MM-DD；缺省等于 startDate */
  endDate?: string
  /** 地点 */
  location?: string
  /** 备注 */
  description?: string
}

/** 把 YYYY-MM-DD 规整成 plus.calendar 要的 YYYY-MM-DD HH:mm:ss */
function stamp(date: string, time: string): string {
  return `${date.slice(0, 10)} ${time}`;
}

/**
 * plus.calendar 不在 @dcloudio/types 的 Plus 接口里（该类型只覆盖了部分 HTML5+ 能力），
 * 这里按需扩展，避免为了一个 API 去改全局类型声明。
 */
interface PlusCalendar {
  calendar: {
    createEvent(
      event: {
        title: string;
        startTime: string;
        endTime: string;
        location?: string;
        description?: string;
      },
      success: () => void,
      fail: (e: any) => void,
    ): void;
    openCalendar(): void;
  };
}

/**
 * 写入系统日历。
 *
 * @returns 写入成功时 resolve；失败（无权限 / 系统日历不可用 / 非 App 端）时 reject
 */
export function addToSystemCalendar(input: CalendarEventInput): Promise<void> {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    const start = input.startDate ? stamp(input.startDate, "00:00:00") : "";
    const end = stamp(input.endDate || input.startDate, "23:59:59");
    if (!start) {
      reject(new Error("缺少活动日期"));
      return;
    }
    const p = plus as unknown as PlusCalendar;
    p.calendar.createEvent(
      {
        title: input.title,
        startTime: start,
        endTime: end,
        location: input.location || "",
        description: input.description || "",
      },
      () => resolve(),
      (e: any) => {
        // 权限被拒时系统会回错误码，此时给用户可执行的提示
        reject(new Error(e?.message || "写入系统日历失败"));
      },
    );
    return;
    // #endif

    // #ifndef APP-PLUS
    reject(new Error("当前环境不支持写入系统日历"));
    // #endif
  });
}

/**
 * 拉起系统日历应用（用户想自己看一眼日程时用）。
 * 不支持时静默失败。
 */
export function openSystemCalendar(): void {
  // #ifdef APP-PLUS
  const p = plus as unknown as PlusCalendar;
  p.calendar.openCalendar();
  // #endif
}
