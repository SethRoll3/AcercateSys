export function toE164(phone: string, defaultCountryCode = '+502') {
  const digits = String(phone).replace(/\D+/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) {
    return defaultCountryCode + digits.slice(1)
  }
  if (digits.startsWith('502') || digits.startsWith('1') || digits.startsWith('44')) {
    return '+' + digits
  }
  if (digits.startsWith('+' )) return digits
  return defaultCountryCode + digits
}

