// Country outlines come from the world-atlas package (Natural Earth, 110m). Nothing is fetched from a map server, so the map works offline.
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Topology, GeometryCollection } from 'topojson-specification'

export type Country = Feature<Geometry, { name: string }>

/** Loaded on first use, so the outlines stay out of the pages that never show a map. */
let world: Promise<Country[]> | null = null
export function loadCountries(): Promise<Country[]> {
  world ??= import('world-atlas/countries-110m.json').then((m) => {
    const topology = m.default as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
    return (feature(topology, topology.objects.countries) as FeatureCollection<Geometry, { name: string }>).features
  })
  return world
}

const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").trim()

/** Names the records use that the atlas spells differently (World Bank style names on the left, the atlas name on the right). */
const ALIASES: Record<string, string> = {
  "lao people's democratic republic": 'laos', 'viet nam': 'vietnam', 'korea, republic of': 'south korea', 'korea, rep.': 'south korea',
  "korea, democratic people's republic of": 'north korea', 'russian federation': 'russia', 'iran, islamic republic of': 'iran', 'syrian arab republic': 'syria',
  'congo, democratic republic of': 'dem. rep. congo', 'congo - kinshasa': 'dem. rep. congo', 'tanzania, united republic of': 'tanzania',
  'egypt, arab republic of': 'egypt', 'kyrgyz republic': 'kyrgyzstan', 'slovak republic': 'slovakia', 'czech republic': 'czechia',
  'turkiye': 'turkey', 'türkiye': 'turkey', 'bosnia & herzegovina': 'bosnia and herz.', 'bosnia and herzegovina': 'bosnia and herz.',
  'dominican republic': 'dominican rep.', "cote d'ivoire": "côte d'ivoire", 'united states of america': 'united states of america', 'united states': 'united states of america',
  'socialist republic of vietnam': 'vietnam', 'republic of india': 'india', 'republic of liberia': 'liberia', 'kingdom of cambodia': 'cambodia',
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** The outline for a country given by name or ISO alpha-2 code, or undefined when the atlas has none (very small countries are not in the 110m set). */
export function findCountry(countries: Country[], value: string): Country | undefined {
  const isCode = /^[A-Za-z]{2}$/.test(value.trim())
  let key = norm(value)
  if (isCode) { try { key = norm(regionNames.of(value.trim().toUpperCase()) ?? key) } catch { /* not a region code: use the text as given */ } }
  key = ALIASES[key] ?? key
  return countries.find((c) => norm(c.properties.name) === key)
}
