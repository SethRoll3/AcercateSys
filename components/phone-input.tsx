"use client"

import PhoneInputLib from 'react-phone-input-2'
import 'react-phone-input-2/lib/style.css'

interface Props {
  value?: string
  countryDialCode?: string
  onChange: (localNumber: string, countryDialCode: string) => void
}

function dialToIso(dial: string) {
  const d = (dial || '+502').replace('+','')
  const map: Record<string, string> = {
    '502': 'gt', '1': 'us', '52': 'mx', '34': 'es', '57': 'co', '51': 'pe', '54': 'ar', '56': 'cl', '503': 'sv', '504': 'hn', '505': 'ni', '506': 'cr', '507': 'pa', '55': 'br', '58': 've', '591': 'bo', '593': 'ec', '595': 'py', '598': 'uy', '353': 'ie', '44': 'gb', '39': 'it'
  }
  return map[d] || 'gt'
}

export function PhoneInput({ value = '', countryDialCode = '+502', onChange }: Props) {
  return (
    <div className="phone-input-wrapper w-full">
      <PhoneInputLib
        country={dialToIso(countryDialCode)}
        value={`${(countryDialCode || '').replace('+','')}${value}`}
        enableSearch
        countryCodeEditable={false}
        specialLabel=""
        inputProps={{ placeholder: 'Ingresa el número', name: 'phone', autoComplete: 'tel' }}
        inputStyle={{
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
          height: 40,
          width: '100%',
          borderColor: 'var(--border)',
          borderRadius: 'var(--radius-md)'
        }}
        buttonStyle={{
          backgroundColor: 'var(--muted)',
          borderColor: 'var(--border)'
        }}
        dropdownStyle={{
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)'
        }}
        onChange={(val: string, data: any) => {
          const dial = data?.dialCode ? `+${data.dialCode}` : ''
          const local = dial ? val.replace(new RegExp(`^${data.dialCode}`), '') : val
          onChange(local, dial)
        }}
      />
    </div>
  )
}
