export const LANGUAGES = [
  { value: 'English',            label: 'English',            short: 'EN' },
  { value: 'Traditional Chinese', label: 'Traditional Chinese', short: '繁體' },
]

export function langShort(value) {
  return LANGUAGES.find(l => l.value === value)?.short ?? value
}
