// Normalizes gppd_data.json (all values are strings, about 29% filled) into country_years rows.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Element { structure: string; name: string; value: string | null; group: number | null }
interface Profile { country: string; year: string; elements: Element[] }

const FILE = fileURLToPath(new URL('../gppd_data.json', import.meta.url))
const OUTLIER_BIDDERS = 50 // C4.10b above this is implausible and is flagged, not hidden

export interface CountryYearRow {
  id: string
  country: string
  year: number
  indicators: Record<string, number | null>
  completeness: number
  flags: string[]
}

export function buildCountryYears(countries: string[]): CountryYearRow[] {
  const { countryProfiles } = JSON.parse(readFileSync(FILE, 'utf8')) as { countryProfiles: Profile[] }
  return countryProfiles
    .filter((p) => countries.includes(p.country))
    .map((p) => {
      const indicators: Record<string, number | null> = {}
      let filled = 0
      for (const e of p.elements) {
        if (e.group !== null && e.group !== 0) continue // keep the first value of multi-valued items
        const n = e.value === null || e.value.trim() === '' ? NaN : Number(e.value)
        if (Number.isFinite(n)) { indicators[e.structure] = n; filled++ }
        else if (!(e.structure in indicators)) indicators[e.structure] = null
      }
      const flags: string[] = []
      const bidders = indicators['C4.10b']
      if (bidders != null && bidders > OUTLIER_BIDDERS) flags.push('C4.10b outlier')
      return {
        id: `${p.country}-${p.year}`, country: p.country, year: Number(p.year), indicators,
        completeness: Math.round((filled / p.elements.length) * 100) / 100, flags,
      }
    })
}
