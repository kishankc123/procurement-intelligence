import { useEffect, useMemo, useState } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { loadCountries, type Country } from '../MapCard/geo'
import styles from './WorldBackdrop.module.css'

const W = 1000
const H = 500

/**
 * A faint world map to sit behind a hero. Decorative only (hidden from screen readers, ignores the pointer). It reuses the offline country outlines of the map
 * card, so nothing is fetched from a map server, and it draws nothing until they have loaded.
 */
export function WorldBackdrop() {
  const [countries, setCountries] = useState<Country[] | null>(null)
  useEffect(() => { loadCountries().then(setCountries, () => setCountries(null)) }, [])
  const paths = useMemo(() => {
    if (!countries) return []
    const land = countries.filter((c) => c.properties.name !== 'Antarctica')
    const path = geoPath(geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: land }))
    return land.map((c) => ({ name: c.properties.name, d: path(c) ?? '' }))
  }, [countries])
  return (
    <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {paths.map((p) => <path key={p.name} d={p.d} />)}
    </svg>
  )
}
