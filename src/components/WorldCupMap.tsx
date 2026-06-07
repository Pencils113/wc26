import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { useEffect, useMemo, useState } from 'react'
import { feature } from 'topojson-client'
import worldAtlasUrl from 'world-atlas/countries-110m.json?url'
import { teamMapLocations } from '../data/mapLocations'
import { teams, teamsById } from '../data/teams'
import { getBestMapStage, mapStageLabels, type MapStage, type TeamMapStages } from '../lib/mapProgress'
import type { TeamId } from '../types'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

interface WorldAtlasTopology extends Topology {
  objects: {
    countries: GeometryCollection
  }
}

interface WorldCountryProperties {
  name?: string
}

type WorldCountryFeature = Feature<Geometry, WorldCountryProperties> & {
  id?: string | number
}

interface WorldCupMapProps {
  kicker: string
  note?: string
  title: string
  stages: TeamMapStages
  compact?: boolean
}

interface HoverTarget {
  teamIds: TeamId[]
  x: number
  y: number
}

const mapWidth = 960
const mapHeight = 430
const stageOrder: MapStage[] = ['field', 'round32', 'round16', 'quarterfinal', 'semifinal', 'finalist', 'champion']

const normalizeCountryId = (id: string | number | undefined) => (id === undefined ? '' : String(Number(id)))

export function WorldCupMap({ kicker, note, title, stages, compact = false }: WorldCupMapProps) {
  const [countries, setCountries] = useState<WorldCountryFeature[]>([])
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)

  useEffect(() => {
    let ignore = false

    fetch(worldAtlasUrl)
      .then((response) => response.json() as Promise<WorldAtlasTopology>)
      .then((topology) => {
        if (ignore) return
        const collection = feature(topology, topology.objects.countries) as FeatureCollection<
          Geometry,
          WorldCountryProperties
        >
        setCountries(collection.features as WorldCountryFeature[])
      })
      .catch(() => setCountries([]))

    return () => {
      ignore = true
    }
  }, [])

  const projection = useMemo(
    () => geoNaturalEarth1().scale(170).translate([mapWidth / 2, mapHeight / 2 + 28]),
    [],
  )
  const path = useMemo(() => geoPath(projection), [projection])

  const countryTeams = useMemo(() => {
    const grouped = new Map<string, TeamId[]>()

    for (const team of teams) {
      const countryId = teamMapLocations[team.id]?.countryId
      if (!countryId) continue
      grouped.set(countryId, [...(grouped.get(countryId) ?? []), team.id])
    }

    return grouped
  }, [])

  const countryStages = useMemo(() => {
    const grouped = new Map<string, MapStage>()

    countryTeams.forEach((teamIds, countryId) => {
      grouped.set(
        countryId,
        getBestMapStage(teamIds.map((teamId) => stages[teamId] ?? 'field')),
      )
    })

    return grouped
  }, [countryTeams, stages])

  const markers = useMemo(
    () =>
      teams
        .map((team) => {
          const location = teamMapLocations[team.id]
          const projected = location ? projection(location.coordinates) : null
          if (!location || !projected) return null

          return {
            team,
            stage: stages[team.id] ?? 'field',
            x: projected[0],
            y: projected[1],
          }
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    [projection, stages],
  )

  return (
    <section className={compact ? 'section-block map-panel compact' : 'section-block map-panel'}>
      <div className="map-panel-head">
        <div>
          <p className="kicker">{kicker}</p>
          <h2>{title}</h2>
          {note && <p className="map-note">{note}</p>}
        </div>
        <div className="map-legend" aria-label="Map legend">
          {stageOrder.map((stage) => (
            <span className={`map-legend-item stage-${stage}`} key={stage}>
              {mapStageLabels[stage]}
            </span>
          ))}
        </div>
      </div>

      <div className="world-map-frame">
        <svg aria-label={title} className="world-map" role="img" viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
          <rect className="map-backdrop" height={mapHeight} width={mapWidth} />
          <path className="map-sphere" d={path({ type: 'Sphere' }) ?? undefined} />
          {countries.map((country) => {
            const countryId = normalizeCountryId(country.id)
            const stage = countryStages.get(countryId)
            const teamIds = countryTeams.get(countryId) ?? []

            return (
              <path
                className={stage ? `map-country active stage-${stage}` : 'map-country'}
                d={path(country) ?? undefined}
                key={countryId || country.properties.name}
                onMouseEnter={() => {
                  const centroid = path.centroid(country)
                  setHoverTarget({ teamIds, x: centroid[0], y: centroid[1] })
                }}
                onMouseLeave={() => setHoverTarget(null)}
              />
            )
          })}
          <g className="map-markers">
            {markers.map(({ team, stage, x, y }) => (
              <g
                className={`map-marker stage-${stage}`}
                key={team.id}
                onMouseEnter={() => setHoverTarget({ teamIds: [team.id], x, y })}
                onMouseLeave={() => setHoverTarget(null)}
                transform={`translate(${x} ${y})`}
              >
                <circle r={stage === 'champion' ? 4.4 : 3.2} />
              </g>
            ))}
          </g>
        </svg>
        {hoverTarget && hoverTarget.teamIds.length > 0 && (
          <MapHoverCard stages={stages} target={hoverTarget} />
        )}
      </div>
    </section>
  )
}

function MapHoverCard({
  stages,
  target,
}: {
  stages: TeamMapStages
  target: HoverTarget
}) {
  const primaryTeam = teamsById[target.teamIds[0]]
  const visibleTeams = target.teamIds.map((teamId) => teamsById[teamId]).filter(Boolean)
  const left = `${Math.min(82, Math.max(18, (target.x / mapWidth) * 100))}%`
  const top = `${Math.min(78, Math.max(22, (target.y / mapHeight) * 100))}%`
  const stage = getBestMapStage(visibleTeams.map((team) => stages[team.id] ?? 'field'))

  if (!primaryTeam) return null

  return (
    <div className="map-hover-card" style={{ left, top }}>
      <span className="flag-frame">
        <img alt="" src={`https://flagcdn.com/${primaryTeam.countryCode}.svg`} />
      </span>
      <span>
        <strong>{visibleTeams.map((team) => team.name).join(' / ')}</strong>
        <small>
          {visibleTeams.length === 1 ? primaryTeam.code : `${visibleTeams.length} teams`} · {mapStageLabels[stage]}
        </small>
      </span>
    </div>
  )
}
