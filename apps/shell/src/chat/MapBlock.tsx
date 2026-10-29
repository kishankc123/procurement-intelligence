import { contractsWithoutCountry, projectCountryMarkers, supplierCountryMarkers, useAllContracts, useProjects } from '@pi/data'
import { MapCard } from '@pi/domain'
import { Card } from '@pi/ui'
import { MissingInfo } from './CardBoundary'

export type MapKind = 'suppliers' | 'projects'

/** A map the model asked for. It only chooses the kind; the places come from the stored contracts and projects, never from the model. */
export function MapBlock({ kind, projectId }: { kind: MapKind; projectId?: string | null }) {
  const contracts = useAllContracts()
  const projects = useProjects()
  const query = kind === 'suppliers' ? contracts : projects
  if (query.isLoading) return <Card state="loading">{null}</Card>
  if (query.isError) return <Card state="error">{null}</Card>

  if (kind === 'projects') {
    const list = projects.data ?? []
    return <MapCard title="Where the projects are" markers={projectCountryMarkers(list)} source="Source: the borrower country of each stored project." />
  }
  const all = (contracts.data ?? []).filter((c) => !projectId || c.project_id === projectId)
  if (all.length === 0) return <MissingInfo title="Supplier map" text="No contracts are on record for this selection, so there are no supplier countries to map." />
  return (
    <MapCard
      title={projectId ? `Where the suppliers of ${projectId} are` : 'Where the suppliers are'}
      markers={supplierCountryMarkers(all)} withoutCountry={contractsWithoutCountry(all)}
      source="Source: supplier country on the contract awards (public)."
    />
  )
}
