import { useEffect, useMemo, useState } from 'react'
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import type { MapMarker } from '@pi/data'
import { Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { findCountry, loadCountries, type Country } from './geo'
import styles from './MapCard.module.css'

interface Props {
  title: string
  markers: MapMarker[]
  /** Where the records come from, shown under the map. */
  source: string
  /** Records that have no country at all, reported as not placed instead of guessed. */
  withoutCountry?: number
  /** Shown when there are no markers; the action says where to add the data. */
  empty?: { title: string; text: string; action?: React.ReactNode }
}

const W = 760
const H = 380

/**
 * A world map with one circle per place. The outlines are local (no map server), the circles come from the markers, and a marker whose country the atlas does
 * not have is listed under the map as not placed. The marker list below is the accessible version of the picture.
 */
export function MapCard({ title, markers, source, withoutCountry = 0, empty }: Props) {
  const [countries, setCountries] = useState<Country[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  useEffect(() => { loadCountries().then(setCountries, () => setFailed(true)) }, [])

  const drawn = useMemo(() => {
    if (!countries) return null
    const land = countries.filter((c) => c.properties.name !== 'Antarctica')
    const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: land })
    const path = geoPath(projection)
    const placed: { marker: MapMarker; country: Country; x: number; y: number }[] = []
    const notPlaced: MapMarker[] = []
    for (const marker of markers) {
      const country = findCountry(countries, marker.country)
      const xy = country ? projection(geoCentroid(country)) : null
      if (country && xy) placed.push({ marker, country, x: xy[0], y: xy[1] })
      else notPlaced.push(marker)
    }
    return { land, path, placed, notPlaced }
  }, [countries, markers])

  const aside = <ProvenanceChip kind="derived" detail={`n=${markers.reduce((n, m) => n + m.count, 0)}`} />
  if (failed) return <Card title={title} state="error">{null}</Card>
  if (!drawn) return <Card title={title} aside={aside} state="loading">{null}</Card>
  if (markers.length === 0) return <Card title={title}><EmptyState title={empty?.title ?? 'Nothing to show on the map'} text={empty?.text} action={empty?.action} /></Card>

  const highlighted = new Set(drawn.placed.map((p) => p.country.properties.name))
  const picked = markers.find((m) => m.id === pickedId) ?? null
  const radius = (count: number) => Math.min(5 + 3 * Math.sqrt(count), 22)

  return (
    <Card title={title} aside={aside}>
      <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${drawn.placed.length} places`}>
        {drawn.land.map((c) => (
          <path key={c.properties.name} d={drawn.path(c) ?? undefined} className={highlighted.has(c.properties.name) ? styles.hit : styles.land} />
        ))}
        {drawn.placed.map(({ marker, x, y }) => (
          <circle key={marker.id} cx={x} cy={y} r={radius(marker.count)} className={marker.id === pickedId ? styles.dotOn : styles.dot}
            onClick={() => setPickedId(marker.id === pickedId ? null : marker.id)}>
            <title>{marker.label}: {marker.detail}</title>
          </circle>
        ))}
      </svg>
      <ul className={styles.list}>
        {markers.map((m) => (
          <li key={m.id}>
            <button type="button" aria-pressed={m.id === pickedId} onClick={() => setPickedId(m.id === pickedId ? null : m.id)}>
              <strong>{m.label}</strong> <span className={styles.count}>{m.count}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.detail} aria-live="polite">{picked ? `${picked.label}: ${picked.detail}` : 'Click a circle or a name for details.'}</p>
      {(drawn.notPlaced.length > 0 || withoutCountry > 0) && (
        <p className={styles.note}>
          <ProvenanceChip kind="missing" />{' '}
          {drawn.notPlaced.length > 0 && <>Not on the map (no outline for): {drawn.notPlaced.map((m) => m.label).join(', ')}. </>}
          {withoutCountry > 0 && <>{withoutCountry} {withoutCountry === 1 ? 'record has' : 'records have'} no country.</>}
        </p>
      )}
      <p className={styles.note}>{source} The map places each country by its centre; it does not show a site.</p>
    </Card>
  )
}
