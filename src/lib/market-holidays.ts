// Iranian official holidays (bourse closed) as Tehran-local dates: YYYY-MM-DD (Gregorian).
// Lunar-calendar holidays are approximate and may shift by a day; edit freely.
export const IRAN_MARKET_HOLIDAYS: ReadonlySet<string> = new Set<string>([
  // --- 1405 (2026-03 → 2027-03) ---
  "2026-03-20", // عید فطر
  "2026-03-21", // نوروز / تعطیل عید فطر
  "2026-03-22",
  "2026-03-23",
  "2026-03-24",
  "2026-04-01", // ۱۲ فروردین - روز جمهوری اسلامی
  "2026-04-02", // ۱۳ فروردین - سیزده‌بدر
  "2026-05-26", // عید قربان
  "2026-06-03", // عید غدیر
  "2026-06-04", // ۱۴ خرداد - رحلت امام خمینی
  "2026-06-05", // ۱۵ خرداد - قیام خرداد
  "2026-06-25", // تاسوعا
  "2026-06-26", // عاشورا
  "2026-08-04", // اربعین
  "2026-08-12", // رحلت پیامبر / شهادت امام حسن
  "2026-08-14", // شهادت امام رضا
  "2026-08-22", // شهادت امام حسن عسکری
  "2026-08-31", // میلاد پیامبر و امام صادق
  "2027-01-05", // مبعث
  "2027-01-23", // ولادت امام زمان
  "2027-02-11", // ۲۲ بهمن - پیروزی انقلاب
  "2027-02-15", // شهادت حضرت فاطمه
  "2027-03-08", // شهادت امام علی
  "2027-03-19", // عید فطر
  "2027-03-20", // ۲۹ اسفند - ملی شدن صنعت نفت / تعطیل عید فطر
  "2027-03-21", // نوروز
  "2027-03-22",
  "2027-03-23",
  "2027-03-24",
]);

export function tehranDateKey(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

export function isIranHoliday(d: Date): boolean {
  return IRAN_MARKET_HOLIDAYS.has(tehranDateKey(d));
}
