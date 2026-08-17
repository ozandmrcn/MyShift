import { useShiftStore } from '../stores/useShiftStore'
import tr from './tr'
import en from './en'
import type { TranslationKeys } from './tr'

type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${NestedKeyOf<T[K]>}`
    : K
}[keyof T & string]

export type TKey = NestedKeyOf<TranslationKeys>

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key]
    return val !== undefined ? String(val) : `{${key}}`
  })
}

const locales = { tr, en } as const

export function useT() {
  const language = useShiftStore((s) => s.settings.language)
  const locale = locales[language] ?? locales.en

  const t = (key: TKey, vars?: Record<string, string | number>): string => {
    const val = getNestedValue(locale as unknown as Record<string, unknown>, key)
    if (val === undefined) {
      // Fallback to English
      const enVal = getNestedValue(en as unknown as Record<string, unknown>, key)
      if (enVal === undefined) return key
      return vars ? interpolate(enVal, vars) : enVal
    }
    return vars ? interpolate(val, vars) : val
  }

  return { t, language }
}
