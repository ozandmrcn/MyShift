const MONTH_NAMES_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const WEEKDAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const WEEKDAY_SHORT_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const WEEKDAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function getMonthNames(lang: string): string[] {
  return lang === 'tr' ? MONTH_NAMES_TR : MONTH_NAMES_EN
}

export function getWeekdayNames(lang: string): string[] {
  return lang === 'tr' ? WEEKDAY_NAMES_TR : WEEKDAY_NAMES_EN
}

export function getWeekdayShort(lang: string): string[] {
  return lang === 'tr' ? WEEKDAY_SHORT_TR : WEEKDAY_SHORT_EN
}
