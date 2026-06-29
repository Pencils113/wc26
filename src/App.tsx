import {
  Check,
  FileCheck2,
  GripVertical,
  Info,
  Lock,
  Save,
  Table2,
  Trophy,
  User,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type PointerEvent, type SetStateAction } from 'react'
import './App.css'
import { WorldCupMap } from './components/WorldCupMap'
import { emptyActualResults } from './data/results'
import { roomBySlug } from './data/rooms'
import { teamsByGroup, teamsById } from './data/teams'
import {
  buildResolvedBracket,
  createInitialPicks,
  getChampion,
  getFlagUrl,
  getStoredChampion,
  getTeamSeedLabel,
  isBracketComplete,
  isGroupStageComplete,
  normalizeBracketPicks,
  placeTeamInGroup,
  removeTeamFromGroup,
  setWinner,
  toggleThirdPlace,
} from './lib/bracket'
import { buildLeaderboard, scoreSubmission } from './lib/scoring'
import { getActualTeamMapStages, getPredictionTeamMapStages } from './lib/mapProgress'
import { KNOCKOUT_ROUND_ORDER, knockoutLayout } from './lib/knockoutLayout'
import { fetchEspnScoreboardMatches, mergeMatchResults } from './lib/espnScoreboard'
import { buildCurrentGroupTables, buildProvisionalActualResults, type CurrentGroupTable } from './lib/groupStandings'
import {
  fetchRemoteActualResults,
  fetchRemoteMatches,
  fetchRemoteSubmissions,
  submitRemoteBracket,
  subscribeToRemotePoolUpdates,
} from './lib/poolRepository'
import {
  loadLocalSubmissions,
  loadStoredRoomSession,
  saveLocalSubmissions,
  saveStoredRoomSession,
  upsertLocalSubmission,
} from './lib/storage'
import { hasSupabaseConfig } from './lib/supabaseClient'
import { GROUP_IDS, type ActualResults, type BracketPicks, type BracketSubmission, type GroupId, type KnockoutRound, type MatchResult, type ResolvedMatch, type Room, type TeamId } from './types'

type AppStep = 'gate' | 'name' | 'rulesIntro' | 'build' | 'leaderboard'

interface RoomSession {
  roomSlug: string
  ownerName: string
  ownerEmail?: string
}

interface ScheduleTeam {
  teamId: TeamId | null
  label: string
}

interface ScheduleFixture {
  id: string
  date: string
  time: string
  startsAt: number
  venue: string
  teams: [ScheduleTeam, ScheduleTeam]
  label: string
  status: 'completed' | 'live' | 'upcoming'
  statusDetail?: string
  displayClock?: string
  score?: [number, number]
  winnerId?: TeamId | null
}

const PASSCODES: Record<string, string> = {
  conway: 'conway',
  larooch: 'larooch',
  sixseven: 'sixseven',
  imhoteponly: 'master',
}
const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.png`

const GROUP_ADVANCER_POINTS = 2
const GROUP_PLACEMENT_POINTS = [3, 2, 1, 0] as const

const KNOCKOUT_TIMES: Record<string, string> = {
  M73: '3:00 PM ET',
  M74: '4:30 PM ET',
  M75: '9:00 PM ET',
  M76: '1:00 PM ET',
  M77: '5:00 PM ET',
  M78: '1:00 PM ET',
  M79: '9:00 PM ET',
  M80: '12:00 PM ET',
  M81: '8:00 PM ET',
  M82: '4:00 PM ET',
  M83: '7:00 PM ET',
  M84: '3:00 PM ET',
  M85: '11:00 PM ET',
  M86: '6:00 PM ET',
  M87: '9:30 PM ET',
  M88: '2:00 PM ET',
  M89: '5:00 PM ET',
  M90: '1:00 PM ET',
  M91: '4:00 PM ET',
  M92: '8:00 PM ET',
  M93: '3:00 PM ET',
  M94: '8:00 PM ET',
  M95: '12:00 PM ET',
  M96: '4:00 PM ET',
  M97: '4:00 PM ET',
  M98: '3:00 PM ET',
  M99: '5:00 PM ET',
  M100: '9:00 PM ET',
  M101: '3:00 PM ET',
  M102: '3:00 PM ET',
  M104: '3:00 PM ET',
}
const ROUND_OF_32_MATCH_IDS = Array.from({ length: 16 }, (_, index) => `M${index + 73}`)
const ROUND_OF_32_MATCH_ID_SET = new Set(ROUND_OF_32_MATCH_IDS)

type GroupStageFixtureDefinition = readonly [
  id: string,
  group: GroupId,
  isoUtc: string,
  venue: string,
  teams: readonly [TeamId, TeamId],
]

const GROUP_STAGE_FIXTURES = [
  ['G01', 'A', '2026-06-11T19:00:00Z', 'Estadio Banorte', ['mexico', 'south-africa']],
  ['G02', 'A', '2026-06-12T02:00:00Z', 'Estadio Akron', ['korea-republic', 'czechia']],
  ['G03', 'B', '2026-06-12T19:00:00Z', 'BMO Field', ['canada', 'bosnia-herzegovina']],
  ['G04', 'D', '2026-06-13T01:00:00Z', 'SoFi Stadium', ['united-states', 'paraguay']],
  ['G05', 'B', '2026-06-13T19:00:00Z', "Levi's Stadium", ['qatar', 'switzerland']],
  ['G06', 'C', '2026-06-13T22:00:00Z', 'MetLife Stadium', ['brazil', 'morocco']],
  ['G07', 'C', '2026-06-14T01:00:00Z', 'Gillette Stadium', ['haiti', 'scotland']],
  ['G08', 'D', '2026-06-14T04:00:00Z', 'BC Place', ['australia', 'turkiye']],
  ['G09', 'E', '2026-06-14T17:00:00Z', 'NRG Stadium', ['germany', 'curacao']],
  ['G10', 'F', '2026-06-14T20:00:00Z', 'AT&T Stadium', ['netherlands', 'japan']],
  ['G11', 'E', '2026-06-14T23:00:00Z', 'Lincoln Financial Field', ['cote-divoire', 'ecuador']],
  ['G12', 'F', '2026-06-15T02:00:00Z', 'Estadio BBVA', ['sweden', 'tunisia']],
  ['G13', 'H', '2026-06-15T16:00:00Z', 'Mercedes-Benz Stadium', ['spain', 'cabo-verde']],
  ['G14', 'G', '2026-06-15T19:00:00Z', 'Lumen Field', ['belgium', 'egypt']],
  ['G15', 'H', '2026-06-15T22:00:00Z', 'Hard Rock Stadium', ['saudi-arabia', 'uruguay']],
  ['G16', 'G', '2026-06-16T01:00:00Z', 'SoFi Stadium', ['iran', 'new-zealand']],
  ['G17', 'I', '2026-06-16T19:00:00Z', 'MetLife Stadium', ['france', 'senegal']],
  ['G18', 'I', '2026-06-16T22:00:00Z', 'Gillette Stadium', ['iraq', 'norway']],
  ['G19', 'J', '2026-06-17T01:00:00Z', 'GEHA Field at Arrowhead Stadium', ['argentina', 'algeria']],
  ['G20', 'J', '2026-06-17T04:00:00Z', "Levi's Stadium", ['austria', 'jordan']],
  ['G21', 'K', '2026-06-17T17:00:00Z', 'NRG Stadium', ['portugal', 'congo-dr']],
  ['G22', 'L', '2026-06-17T20:00:00Z', 'AT&T Stadium', ['england', 'croatia']],
  ['G23', 'L', '2026-06-17T23:00:00Z', 'BMO Field', ['ghana', 'panama']],
  ['G24', 'K', '2026-06-18T02:00:00Z', 'Estadio Banorte', ['uzbekistan', 'colombia']],
  ['G25', 'A', '2026-06-18T16:00:00Z', 'Mercedes-Benz Stadium', ['czechia', 'south-africa']],
  ['G26', 'B', '2026-06-18T19:00:00Z', 'SoFi Stadium', ['switzerland', 'bosnia-herzegovina']],
  ['G27', 'B', '2026-06-18T22:00:00Z', 'BC Place', ['canada', 'qatar']],
  ['G28', 'A', '2026-06-19T01:00:00Z', 'Estadio Akron', ['mexico', 'korea-republic']],
  ['G29', 'D', '2026-06-19T19:00:00Z', 'Lumen Field', ['united-states', 'australia']],
  ['G30', 'C', '2026-06-19T22:00:00Z', 'Gillette Stadium', ['scotland', 'morocco']],
  ['G31', 'C', '2026-06-20T00:30:00Z', 'Lincoln Financial Field', ['brazil', 'haiti']],
  ['G32', 'D', '2026-06-20T03:00:00Z', "Levi's Stadium", ['turkiye', 'paraguay']],
  ['G33', 'F', '2026-06-20T17:00:00Z', 'NRG Stadium', ['netherlands', 'sweden']],
  ['G34', 'E', '2026-06-20T20:00:00Z', 'BMO Field', ['germany', 'cote-divoire']],
  ['G35', 'E', '2026-06-21T00:00:00Z', 'GEHA Field at Arrowhead Stadium', ['ecuador', 'curacao']],
  ['G36', 'F', '2026-06-21T04:00:00Z', 'Estadio BBVA', ['tunisia', 'japan']],
  ['G37', 'H', '2026-06-21T16:00:00Z', 'Mercedes-Benz Stadium', ['spain', 'saudi-arabia']],
  ['G38', 'G', '2026-06-21T19:00:00Z', 'SoFi Stadium', ['belgium', 'iran']],
  ['G39', 'H', '2026-06-21T22:00:00Z', 'Hard Rock Stadium', ['uruguay', 'cabo-verde']],
  ['G40', 'G', '2026-06-22T01:00:00Z', 'BC Place', ['new-zealand', 'egypt']],
  ['G41', 'J', '2026-06-22T17:00:00Z', 'AT&T Stadium', ['argentina', 'austria']],
  ['G42', 'I', '2026-06-22T21:00:00Z', 'Lincoln Financial Field', ['france', 'iraq']],
  ['G43', 'I', '2026-06-23T00:00:00Z', 'MetLife Stadium', ['norway', 'senegal']],
  ['G44', 'J', '2026-06-23T03:00:00Z', "Levi's Stadium", ['jordan', 'algeria']],
  ['G45', 'K', '2026-06-23T17:00:00Z', 'NRG Stadium', ['portugal', 'uzbekistan']],
  ['G46', 'L', '2026-06-23T20:00:00Z', 'Gillette Stadium', ['england', 'ghana']],
  ['G47', 'L', '2026-06-23T23:00:00Z', 'BMO Field', ['panama', 'croatia']],
  ['G48', 'K', '2026-06-24T02:00:00Z', 'Estadio Akron', ['colombia', 'congo-dr']],
  ['G49', 'B', '2026-06-24T19:00:00Z', 'Lumen Field', ['bosnia-herzegovina', 'qatar']],
  ['G50', 'B', '2026-06-24T19:00:00Z', 'BC Place', ['switzerland', 'canada']],
  ['G51', 'C', '2026-06-24T22:00:00Z', 'Mercedes-Benz Stadium', ['morocco', 'haiti']],
  ['G52', 'C', '2026-06-24T22:00:00Z', 'Hard Rock Stadium', ['scotland', 'brazil']],
  ['G53', 'A', '2026-06-25T01:00:00Z', 'Estadio Banorte', ['czechia', 'mexico']],
  ['G54', 'A', '2026-06-25T01:00:00Z', 'Estadio BBVA', ['south-africa', 'korea-republic']],
  ['G55', 'E', '2026-06-25T20:00:00Z', 'Lincoln Financial Field', ['curacao', 'cote-divoire']],
  ['G56', 'E', '2026-06-25T20:00:00Z', 'MetLife Stadium', ['ecuador', 'germany']],
  ['G57', 'F', '2026-06-25T23:00:00Z', 'AT&T Stadium', ['japan', 'sweden']],
  ['G58', 'F', '2026-06-25T23:00:00Z', 'GEHA Field at Arrowhead Stadium', ['tunisia', 'netherlands']],
  ['G59', 'D', '2026-06-26T02:00:00Z', "Levi's Stadium", ['paraguay', 'australia']],
  ['G60', 'D', '2026-06-26T02:00:00Z', 'SoFi Stadium', ['turkiye', 'united-states']],
  ['G61', 'I', '2026-06-26T19:00:00Z', 'Gillette Stadium', ['norway', 'france']],
  ['G62', 'I', '2026-06-26T19:00:00Z', 'BMO Field', ['senegal', 'iraq']],
  ['G63', 'H', '2026-06-27T00:00:00Z', 'NRG Stadium', ['cabo-verde', 'saudi-arabia']],
  ['G64', 'H', '2026-06-27T00:00:00Z', 'Estadio Akron', ['uruguay', 'spain']],
  ['G65', 'G', '2026-06-27T03:00:00Z', 'Lumen Field', ['egypt', 'iran']],
  ['G66', 'G', '2026-06-27T03:00:00Z', 'BC Place', ['new-zealand', 'belgium']],
  ['G67', 'L', '2026-06-27T21:00:00Z', 'Lincoln Financial Field', ['croatia', 'ghana']],
  ['G68', 'L', '2026-06-27T21:00:00Z', 'MetLife Stadium', ['panama', 'england']],
  ['G69', 'K', '2026-06-27T23:30:00Z', 'Hard Rock Stadium', ['colombia', 'portugal']],
  ['G70', 'K', '2026-06-27T23:30:00Z', 'Mercedes-Benz Stadium', ['congo-dr', 'uzbekistan']],
  ['G71', 'J', '2026-06-28T02:00:00Z', 'GEHA Field at Arrowhead Stadium', ['algeria', 'austria']],
  ['G72', 'J', '2026-06-28T02:00:00Z', 'AT&T Stadium', ['jordan', 'argentina']],
] satisfies readonly GroupStageFixtureDefinition[]

const THIRD_PLACE_FIXTURE = {
  id: 'M103',
  isoUtc: '2026-07-18T21:00:00Z',
  venue: 'Hard Rock Stadium',
} as const

const EASTERN_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/New_York',
})

const EASTERN_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  hour12: true,
  minute: '2-digit',
  timeZone: 'America/New_York',
})

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`

const findSubmissionForSession = (
  submissions: BracketSubmission[],
  roomSlug: string,
  session: RoomSession,
) =>
  submissions.find((submission) => {
    if (submission.roomSlug !== roomSlug) return false
    if (session.ownerEmail) {
      return submission.ownerEmail?.toLowerCase() === session.ownerEmail.toLowerCase()
    }
    return submission.ownerName.toLowerCase() === session.ownerName.toLowerCase()
  }) ?? null

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Something went wrong.'
}

const submissionSourceLabel = (source: BracketSubmission['source']) => {
  if (source === 'local') return 'Your picks'
  return 'Submitted'
}

function App() {
  const [step, setStep] = useState<AppStep>('gate')
  const [selectedRoomSlug, setSelectedRoomSlug] = useState<string | null>(null)
  const [roomSession, setRoomSession] = useState<RoomSession | null>(null)
  const [roomPasscode, setRoomPasscode] = useState('')
  const [picks, setPicks] = useState<BracketPicks>(() => createInitialPicks())
  const [previewSubmission, setPreviewSubmission] = useState<BracketSubmission | null>(null)
  const [localSubmissions, setLocalSubmissions] = useState<BracketSubmission[]>(() => loadLocalSubmissions())
  const [remoteSubmissions, setRemoteSubmissions] = useState<BracketSubmission[]>([])
  const [remoteActualResults, setRemoteActualResults] = useState<ActualResults | null>(null)
  const [remoteMatches, setRemoteMatches] = useState<MatchResult[]>([])
  const [browserMatches, setBrowserMatches] = useState<MatchResult[]>([])
  const [leaderboardOnly, setLeaderboardOnly] = useState(false)
  const [dataError, setDataError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeRoom = selectedRoomSlug ? roomBySlug[selectedRoomSlug] : null
  const liveSubmissions = hasSupabaseConfig ? remoteSubmissions : localSubmissions
  const actualResults = remoteActualResults ?? emptyActualResults
  const liveMatchResults = useMemo(
    () => mergeMatchResults(remoteMatches, browserMatches),
    [browserMatches, remoteMatches],
  )
  const currentGroupTables = useMemo(
    () => buildCurrentGroupTables(liveMatchResults),
    [liveMatchResults],
  )
  const roundOf32KnownSlots = useMemo(() => countKnownRoundOf32TeamSlots(liveMatchResults), [liveMatchResults])
  const groupStageResolved = roundOf32KnownSlots >= 32
  const provisionalGroupCount = groupStageResolved
    ? 0
    : currentGroupTables.filter((table) => table.countedMatches > 0).length
  const scoringResults = useMemo(
    () => buildProvisionalActualResults(actualResults, currentGroupTables),
    [actualResults, currentGroupTables],
  )
  const visibleSubmissions = selectedRoomSlug
    ? liveSubmissions.filter((submission) => submission.roomSlug === selectedRoomSlug)
    : []
  const existingNameOptions = useMemo(() => {
    if (!selectedRoomSlug) return []

    const seen = new Set<string>()
    return liveSubmissions
      .filter((submission) => submission.roomSlug === selectedRoomSlug)
      .map((submission) => submission.ownerName.trim())
      .filter((ownerName) => {
        const normalized = ownerName.toLowerCase()
        if (!ownerName || seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      .sort((a, b) => a.localeCompare(b))
  }, [liveSubmissions, selectedRoomSlug])
  const leaderboard = buildLeaderboard(visibleSubmissions, scoringResults, liveMatchResults)
  const currentSubmission = useMemo(() => {
    if (!roomSession || !selectedRoomSlug) return null

    return (
      findSubmissionForSession(liveSubmissions, selectedRoomSlug, roomSession)
    )
  }, [liveSubmissions, roomSession, selectedRoomSlug])
  const champion = getChampion(picks)
  const groupStageComplete = isGroupStageComplete(picks)
  const bracketReady = isBracketComplete(picks)
  const filledGroupSlots = GROUP_IDS.reduce(
    (sum, group) => sum + picks.groupOrder[group].filter(Boolean).length,
    0,
  )

  useEffect(() => {
    saveLocalSubmissions(localSubmissions)
  }, [localSubmissions])

  useEffect(() => {
    if (!hasSupabaseConfig || !selectedRoomSlug) return undefined

    let cancelled = false

    const refreshRemoteData = async () => {
      try {
        const [nextSubmissions, nextResults, nextMatches] = await Promise.all([
          fetchRemoteSubmissions(selectedRoomSlug),
          fetchRemoteActualResults(),
          fetchRemoteMatches(),
        ])

        if (cancelled) return
        setRemoteSubmissions(nextSubmissions)
        setRemoteActualResults(nextResults)
        setRemoteMatches(nextMatches)
        setDataError('')
      } catch (error) {
        if (!cancelled) setDataError(errorMessage(error))
      }
    }

    void refreshRemoteData()
    const unsubscribe = subscribeToRemotePoolUpdates(() => {
      void refreshRemoteData()
    })
    const intervalId = window.setInterval(() => {
      void refreshRemoteData()
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      unsubscribe()
    }
  }, [selectedRoomSlug])

  useEffect(() => {
    if (!selectedRoomSlug) return undefined

    let cancelled = false
    let activeController: AbortController | null = null

    const refreshBrowserMatches = async () => {
      activeController?.abort()
      const controller = new AbortController()
      activeController = controller

      try {
        const nextMatches = await fetchEspnScoreboardMatches(controller.signal)

        if (!cancelled) {
          setBrowserMatches(nextMatches)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.warn('ESPN browser score fetch failed', error)
      }
    }

    void refreshBrowserMatches()
    const intervalId = window.setInterval(() => {
      void refreshBrowserMatches()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      activeController?.abort()
    }
  }, [selectedRoomSlug])

  const loadSubmissionsForRoom = async (roomSlug: string) => {
    if (!hasSupabaseConfig) {
      return localSubmissions.filter((submission) => submission.roomSlug === roomSlug)
    }

    const nextSubmissions = await fetchRemoteSubmissions(roomSlug)
    setRemoteSubmissions(nextSubmissions)
    return nextSubmissions
  }

  const beginRoom = (roomSlug: string, enteredPasscode: string) => {
    const storedSession = loadStoredRoomSession(roomSlug)

    setSelectedRoomSlug(roomSlug)
    setRoomPasscode(enteredPasscode)
    setPreviewSubmission(null)
    setLeaderboardOnly(false)
    setDataError('')

    if (storedSession) {
      void loadExistingBracket(storedSession)
      return
    }

    setRoomSession(null)
    setPicks(createInitialPicks())
    setStep('name')
    void loadSubmissionsForRoom(roomSlug).catch((error) => setDataError(errorMessage(error)))
  }

  const loadExistingBracket = async (session: RoomSession) => {
    try {
      const roomSubmissions = await loadSubmissionsForRoom(session.roomSlug)
      const existing = findSubmissionForSession(roomSubmissions, session.roomSlug, session)

      saveStoredRoomSession(session)
      setRoomSession(session)
      setLeaderboardOnly(false)
      setPicks(
        existing
          ? normalizeBracketPicks(existing)
          : createInitialPicks(),
      )
      setDataError('')
      setStep(existing ? 'build' : 'rulesIntro')
    } catch (error) {
      setDataError(errorMessage(error))
      setRoomSession(null)
      setPicks(createInitialPicks())
      setStep('name')
    }
  }

  const submitBracket = async () => {
    if (!roomSession || !selectedRoomSlug || !activeRoom || !bracketReady || submitting) return

    const existing = findSubmissionForSession(liveSubmissions, selectedRoomSlug, roomSession)
    if (existing) {
      setPicks(normalizeBracketPicks(existing))
      setLeaderboardOnly(false)
      setStep('leaderboard')
      return
    }

    const now = new Date().toISOString()
    const submission: BracketSubmission = {
      ...picks,
      id: newId(),
      roomSlug: selectedRoomSlug,
      ownerName: roomSession.ownerName,
      ownerEmail: roomSession.ownerEmail,
      submittedAt: now,
      updatedAt: now,
      source: hasSupabaseConfig ? 'supabase' : 'local',
    }

    setSubmitting(true)
    setDataError('')

    try {
      if (hasSupabaseConfig) {
        await submitRemoteBracket({
          picks,
          room: activeRoom,
          roomPasscode,
          session: roomSession,
        })
        const refreshed = await fetchRemoteSubmissions(selectedRoomSlug)
        setRemoteSubmissions(refreshed)
      } else {
        setLocalSubmissions((current) => upsertLocalSubmission(current, submission))
      }

      setPreviewSubmission(null)
      setLeaderboardOnly(false)
      saveStoredRoomSession(roomSession)
      setStep('leaderboard')
    } catch (error) {
      setDataError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const viewLeaderboardOnly = async () => {
    if (!selectedRoomSlug) return

    try {
      await loadSubmissionsForRoom(selectedRoomSlug)
      setRoomSession(null)
      setPicks(createInitialPicks())
      setPreviewSubmission(null)
      setLeaderboardOnly(true)
      setDataError('')
      setStep('leaderboard')
    } catch (error) {
      setDataError(errorMessage(error))
    }
  }

  if (step === 'gate') {
    return <GateScreen onEnter={beginRoom} />
  }

  if (!activeRoom || !selectedRoomSlug) {
    return <GateScreen onEnter={beginRoom} />
  }

  if (step === 'name') {
    return (
      <NameScreen
        error={dataError}
        existingNames={existingNameOptions}
        room={activeRoom}
        onBack={() => setStep('gate')}
        onReady={loadExistingBracket}
        onViewLeaderboard={viewLeaderboardOnly}
      />
    )
  }

  if (step === 'rulesIntro') {
    return <RulesIntroScreen room={activeRoom} onBack={() => setStep('name')} onStart={() => setStep('build')} />
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeRoom={activeRoom}
        roomSession={roomSession}
        step={step}
        onNavigate={setStep}
        onReset={() => setStep('gate')}
        leaderboardOnly={leaderboardOnly}
        showBoard={Boolean(currentSubmission)}
      />

      {step === 'build' && (
        <BuildScreen
          actualResults={scoringResults}
          bracketReady={bracketReady}
          champion={champion}
          filledGroupSlots={filledGroupSlots}
          groupStageComplete={groupStageComplete}
          matchResults={liveMatchResults}
          picks={picks}
          readOnly={Boolean(currentSubmission)}
          setPicks={setPicks}
          submitError={dataError}
          submitting={submitting}
          onClear={() => setPicks(createInitialPicks())}
          onSubmit={submitBracket}
        />
      )}

      {step === 'leaderboard' && (
        <LeaderboardPanel
          actualResults={actualResults}
          currentGroupTables={currentGroupTables}
          entries={leaderboard}
          matchResults={liveMatchResults}
          previewSubmission={previewSubmission}
          provisionalGroupCount={provisionalGroupCount}
          room={activeRoom}
          scoringResults={scoringResults}
          onPreview={setPreviewSubmission}
        />
      )}
    </main>
  )
}

function GateScreen({ onEnter }: { onEnter: (roomSlug: string, passcode: string) => void }) {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const normalized = passcode.trim().toLowerCase()
    const roomSlug = PASSCODES[normalized]

    if (!roomSlug) {
      setError('Invalid pass code.')
      return
    }

    setError('')
    onEnter(roomSlug, normalized)
  }

  return (
    <main className="gate-screen">
      <section className="gate-box">
        <label htmlFor="passcode">Pass code</label>
        <input
          autoFocus
          id="passcode"
          onChange={(event) => setPasscode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          type="password"
          value={passcode}
        />
        <button onClick={submit} type="button">
          Enter
        </button>
        {error && <p>{error}</p>}
      </section>
    </main>
  )
}

function NameScreen({
  error,
  existingNames,
  room,
  onBack,
  onReady,
  onViewLeaderboard,
}: {
  error: string
  existingNames: string[]
  room: Room
  onBack: () => void
  onReady: (session: RoomSession) => void | Promise<void>
  onViewLeaderboard: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const trimmedName = name.trim()

  const continueWithName = () => {
    if (!trimmedName) {
      setFormError('Name required.')
      return
    }

    setFormError('')
    void onReady({ roomSlug: room.slug, ownerName: trimmedName })
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <p className="kicker">{room.name}</p>
        <h1>Pick your name.</h1>
        <div className="dark-input-row">
          <User size={17} />
          <input
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setFormError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') continueWithName()
            }}
            placeholder="Name"
            value={name}
          />
        </div>
        {existingNames.length > 0 && (
          <div className="dark-input-row">
            <User size={17} />
            <select
              aria-label="Existing submissions"
              onChange={(event) => {
                setName(event.target.value)
                setFormError('')
              }}
              value={existingNames.includes(name) ? name : ''}
            >
              <option value="">Existing submissions</option>
              {existingNames.map((existingName) => (
                <option key={existingName} value={existingName}>
                  {existingName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="onboarding-actions">
          <button className="ghost-button" onClick={onBack} type="button">
            Back
          </button>
          <button
            className="solid-button"
            onClick={continueWithName}
            type="button"
          >
            Continue
          </button>
        </div>
        <button
          className="ghost-button full"
          onClick={() => {
            void onViewLeaderboard()
          }}
          type="button"
        >
          <Table2 size={16} />
          View leaderboard
        </button>
        {(formError || error) && <p className="form-error">{formError || error}</p>}
      </section>
    </main>
  )
}

function RulesIntroScreen({
  room,
  onBack,
  onStart,
}: {
  room: Room
  onBack: () => void
  onStart: () => void
}) {
  return (
    <main className="onboarding-screen">
      <section className="rules-intro-card">
        <p className="kicker">{room.name}</p>
        <h1>Rules</h1>
        <div className="rules-intro-grid">
          <article>
            <strong>Groups</strong>
            <span>Rank every group 1-4. Pick exactly 8 third-place teams to advance.</span>
          </article>
          <article>
            <strong>Knockout</strong>
            <span>Click winners forward until you have a champion.</span>
          </article>
          <article>
            <strong>Lock</strong>
            <span>After you submit, your picks are frozen.</span>
          </article>
        </div>
        <ScoringCard compact />
        <div className="onboarding-actions">
          <button className="ghost-button" onClick={onBack} type="button">
            Back
          </button>
          <button className="solid-button" onClick={onStart} type="button">
            Start picking
          </button>
        </div>
      </section>
    </main>
  )
}

function AppHeader({
  activeRoom,
  roomSession,
  step,
  onNavigate,
  onReset,
  leaderboardOnly,
  showBoard,
}: {
  activeRoom: Room
  roomSession: RoomSession | null
  step: AppStep
  onNavigate: (step: AppStep) => void
  onReset: () => void
  leaderboardOnly: boolean
  showBoard: boolean
}) {
  const showNav = leaderboardOnly || showBoard

  return (
    <header className="app-header">
      <button className="wordmark" onClick={onReset} type="button">
        <img alt="" aria-hidden="true" className="brand-logo" src={LOGO_SRC} />
        <strong>{activeRoom.name}</strong>
      </button>
      <div className="header-meta">
        {roomSession?.ownerName && <span>{roomSession.ownerName}</span>}
        <span>
          <Lock size={13} />
          Jun 11
        </span>
      </div>
      {showNav && (
        <nav className="dark-tabs" aria-label="Primary">
          {leaderboardOnly ? (
            <button
              className={step === 'leaderboard' ? 'active' : ''}
              onClick={() => onNavigate('leaderboard')}
              type="button"
            >
              <Table2 size={16} />
              Leaderboard
            </button>
          ) : (
            <>
              <button className={step === 'build' ? 'active' : ''} onClick={() => onNavigate('build')} type="button">
                <FileCheck2 size={16} />
                My Submission
              </button>
              <button
                className={step === 'leaderboard' ? 'active' : ''}
                onClick={() => onNavigate('leaderboard')}
                type="button"
              >
                <Table2 size={16} />
                Leaderboard
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  )
}

function BuildScreen({
  actualResults,
  bracketReady,
  champion,
  filledGroupSlots,
  groupStageComplete,
  matchResults,
  picks,
  readOnly,
  setPicks,
  submitError,
  submitting,
  onClear,
  onSubmit,
}: {
  actualResults: ActualResults
  bracketReady: boolean
  champion: TeamId | null
  filledGroupSlots: number
  groupStageComplete: boolean
  matchResults: MatchResult[]
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
  submitError: string
  submitting: boolean
  onClear: () => void
  onSubmit: () => void | Promise<void>
}) {
  const mapStages = useMemo(() => getPredictionTeamMapStages(picks), [picks])
  const knockoutProgress = useMemo(() => getKnockoutPickProgress(picks), [picks])

  if (readOnly) {
    return <SubmittedBuildScreen actualResults={actualResults} champion={champion} filledGroupSlots={filledGroupSlots} matchResults={matchResults} picks={picks} />
  }

  return (
    <div className="build-shell">
      <aside className="build-rail">
        <section className="panel">
          <p className="kicker">Progress</p>
          <div className="progress-stack">
            <ProgressRow label="Groups" value={`${filledGroupSlots}/48`} complete={groupStageComplete} />
            <ProgressRow label="Thirds" value={`${picks.thirdPlaceAdvancers.length}/8`} complete={picks.thirdPlaceAdvancers.length === 8} />
            <ProgressRow
              label="Knockout"
              value={`${knockoutProgress.completed}/${knockoutProgress.total}`}
              complete={knockoutProgress.completed === knockoutProgress.total}
            />
            <ProgressRow label="Champion" value={champion ? teamsById[champion].code : '-'} complete={Boolean(champion)} />
          </div>
        </section>
        <SubmitPanel
          bracketReady={bracketReady}
          champion={champion}
          className="desktop-submit-panel"
          onClear={onClear}
          onSubmit={onSubmit}
          submitError={submitError}
          submitting={submitting}
        />
      </aside>

      <div className="build-main">
        <WorldCupMap compact kicker="Map" stages={mapStages} title="Your predictions" />
        <GroupStageBuilder picks={picks} readOnly={readOnly} setPicks={setPicks} />
        <ThirdPlaceSelector groupStageComplete={groupStageComplete} picks={picks} readOnly={readOnly} setPicks={setPicks} />
        <KnockoutBuilder picks={picks} readOnly={readOnly} setPicks={setPicks} />
        <SubmitPanel
          bracketReady={bracketReady}
          champion={champion}
          className="mobile-submit-panel"
          onClear={onClear}
          onSubmit={onSubmit}
          submitError={submitError}
          submitting={submitting}
        />
      </div>
    </div>
  )
}

function SubmitPanel({
  bracketReady,
  champion,
  className = '',
  submitError,
  submitting,
  onClear,
  onSubmit,
}: {
  bracketReady: boolean
  champion: TeamId | null
  className?: string
  submitError: string
  submitting: boolean
  onClear: () => void
  onSubmit: () => void | Promise<void>
}) {
  return (
    <section className={`panel submit-panel ${className}`.trim()}>
      <p className="kicker">Submit</p>
      <h2>{champion ? teamsById[champion].name : 'No champion'}</h2>
      <button className="solid-button full" disabled={!bracketReady || submitting} onClick={() => void onSubmit()} type="button">
        <Save size={16} />
        {submitting ? 'Submitting...' : 'Submit picks'}
      </button>
      <button className="ghost-button full" onClick={onClear} type="button">
        Clear picks
      </button>
      {submitError && <p className="form-error">{submitError}</p>}
    </section>
  )
}

function SubmittedBuildScreen({
  actualResults,
  champion,
  filledGroupSlots,
  matchResults,
  picks,
}: {
  actualResults: ActualResults
  champion: TeamId | null
  filledGroupSlots: number
  matchResults: MatchResult[]
  picks: BracketPicks
}) {
  const mapStages = useMemo(() => getPredictionTeamMapStages(picks), [picks])
  const knockoutProgress = useMemo(() => getKnockoutPickProgress(picks), [picks])

  return (
    <div className="review-shell">
      <aside className="build-rail">
        <section className="panel">
          <p className="kicker">Submitted</p>
          <h2>{champion ? teamsById[champion].name : 'No champion'}</h2>
          <div className="frozen-badge">
            <Lock size={15} />
            Frozen
          </div>
        </section>
        <section className="panel">
          <p className="kicker">Status</p>
          <div className="progress-stack">
            <ProgressRow label="Groups" value={`${filledGroupSlots}/48`} complete />
            <ProgressRow label="Thirds" value={`${picks.thirdPlaceAdvancers.length}/8`} complete />
            <ProgressRow
              label="Knockout"
              value={`${knockoutProgress.completed}/${knockoutProgress.total}`}
              complete={knockoutProgress.completed === knockoutProgress.total}
            />
            <ProgressRow label="Champion" value={champion ? teamsById[champion].code : '-'} complete={Boolean(champion)} />
          </div>
        </section>
      </aside>

      <div className="review-main">
        <WorldCupMap compact kicker="Map" stages={mapStages} title="Your predictions" />
        <ReviewGroups actualResults={actualResults} picks={picks} />
        <ReviewBracket actualResults={actualResults} matchResults={matchResults} picks={picks} />
      </div>
    </div>
  )
}

function ReviewGroups({
  actualResults = emptyActualResults,
  mode = 'submission',
  picks,
}: {
  actualResults?: ActualResults
  mode?: 'submission' | 'official'
  picks: BracketPicks
}) {
  return (
    <section className="section-block review-section">
      <SectionHead kicker="01" title="Group Stage" />
      <div className="review-groups-grid">
        {GROUP_IDS.map((group) => {
          const groupScore = mode === 'submission' ? getGroupScore(actualResults, picks, group) : null

          return (
            <article className="review-group-card" key={group}>
              <header>
                <strong>Group {group}</strong>
                <span className={groupScore !== null ? 'group-score' : ''}>
                  {groupScore !== null
                    ? `+${groupScore}`
                    : picks.thirdPlaceAdvancers.includes(group)
                      ? '3 qualify'
                      : '2 qualify'}
                </span>
              </header>
              <div className="review-team-list">
                {picks.groupOrder[group].map((teamId, index) => {
                if (!teamId) return null
                const team = teamsById[teamId]
                const qualifies = index < 2 || (index === 2 && picks.thirdPlaceAdvancers.includes(group))
                const result = mode === 'submission' ? getGroupPickResult(actualResults, picks, group, teamId, index) : null
                const resultClass = result ? ` result-rank-${result.placementCorrect ? 'correct' : 'wrong'}` : ''
                const qualifierClass = qualifies ? ' group-qualified' : ' group-not-qualified'

                return (
                  <div className={`review-team-row${qualifierClass}${resultClass}`} key={teamId}>
                    <span className="review-rank">{index + 1}</span>
                    <TeamIdentity compact teamId={teamId} />
                    {result ? (
                      <span
                        aria-label={result.label}
                        className={result.qualificationCorrect ? 'review-result-pill correct' : 'review-result-pill wrong'}
                        title={result.label}
                      >
                        {result.qualificationCorrect ? <Check size={12} /> : <X size={12} />}
                        <small>{result.placementCorrect ? result.shortLabel : `Actual #${result.actualRank}`}</small>
                        {result.pointLabels.length > 0 && (
                          <span className="point-chip-row">
                            {result.pointLabels.map((label, pointIndex) => (
                              <b className="point-chip" key={`${label}-${pointIndex}`}>
                                {label}
                              </b>
                            ))}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="review-stats">
                        #{team.fifaRank}
                        <small>{team.appearances} apps</small>
                      </span>
                    )}
                  </div>
                )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function getGroupPickResult(
  actualResults: ActualResults,
  picks: BracketPicks,
  group: GroupId,
  teamId: TeamId,
  index: number,
) {
  const actualOrder = actualResults.groupOrder[group]
  if (!actualOrder || actualOrder.length < 4) return null

  const actualAdvancers = new Set([actualOrder[0], actualOrder[1]])
  if (actualResults.thirdPlaceAdvancers.includes(group)) {
    actualAdvancers.add(actualOrder[2])
  }

  const predictedQualified = index < 2 || (index === 2 && picks.thirdPlaceAdvancers.includes(group))
  const actualQualified = actualAdvancers.has(teamId)
  const actualIndex = actualOrder.indexOf(teamId)
  const qualificationCorrect = predictedQualified === actualQualified
  const placementCorrect = actualIndex === index
  const pointLabels = [
    ...(predictedQualified && actualQualified ? [`+${GROUP_ADVANCER_POINTS}`] : []),
    ...(placementCorrect && GROUP_PLACEMENT_POINTS[index] > 0 ? [`+${GROUP_PLACEMENT_POINTS[index]}`] : []),
  ]

  if (qualificationCorrect && predictedQualified) {
    return { actualRank: actualIndex + 1, placementCorrect, pointLabels, qualificationCorrect, label: 'Correctly picked to qualify', shortLabel: 'Qual' }
  }
  if (qualificationCorrect) {
    return { actualRank: actualIndex + 1, placementCorrect, pointLabels, qualificationCorrect, label: 'Correctly picked to miss qualification', shortLabel: 'Out' }
  }
  if (predictedQualified) {
    return { actualRank: actualIndex + 1, placementCorrect, pointLabels, qualificationCorrect, label: 'Picked to qualify, but missed', shortLabel: 'Missed' }
  }
  return { actualRank: actualIndex + 1, placementCorrect, pointLabels, qualificationCorrect, label: 'Did not pick to qualify, but advanced', shortLabel: 'Actual' }
}

function getGroupScore(actualResults: ActualResults, picks: BracketPicks, group: GroupId) {
  const actualOrder = actualResults.groupOrder[group]
  if (!actualOrder || actualOrder.length < 4) return null

  return picks.groupOrder[group].reduce((sum, teamId, index) => {
    if (!teamId) return sum

    const predictedQualified = index < 2 || (index === 2 && picks.thirdPlaceAdvancers.includes(group))
    const actualAdvancers = new Set([actualOrder[0], actualOrder[1]])
    if (actualResults.thirdPlaceAdvancers.includes(group)) {
      actualAdvancers.add(actualOrder[2])
    }

    const advancementPoints = predictedQualified && actualAdvancers.has(teamId) ? GROUP_ADVANCER_POINTS : 0
    const placementPoints = actualOrder.indexOf(teamId) === index ? GROUP_PLACEMENT_POINTS[index] : 0

    return sum + advancementPoints + placementPoints
  }, 0)
}

function ReviewBracket({
  actualResults = emptyActualResults,
  matchResults = [],
  mode = 'submission',
  picks,
}: {
  actualResults?: ActualResults
  matchResults?: MatchResult[]
  mode?: 'submission' | 'official'
  picks: BracketPicks
}) {
  return (
    <section className="section-block review-section">
      <SectionHead kicker="02" title="Knockout" />
      <KnockoutReviewGrid actualResults={actualResults} matchResults={matchResults} mode={mode} picks={picks} />
    </section>
  )
}

function KnockoutReviewGrid({
  actualResults = emptyActualResults,
  matchResults = [],
  matches: resolvedMatches,
  mode = 'submission',
  picks,
}: {
  actualResults?: ActualResults
  matchResults?: MatchResult[]
  matches?: ResolvedMatch[]
  mode?: 'submission' | 'official'
  picks: BracketPicks
}) {
  const matches = resolvedMatches ?? buildResolvedBracket(picks)
  const reviewContext = useMemo(() => buildKnockoutReviewContext(actualResults, matchResults), [actualResults, matchResults])

  return (
    <div className="review-bracket-grid">
      {KNOCKOUT_ROUND_ORDER.map((round) => (
        matches
          .filter((match) => match.round === round)
          .sort((left, right) => knockoutLayout[left.id].row - knockoutLayout[right.id].row)
          .map((match) => {
            const layout = knockoutLayout[match.id]

            return (
              <article
                className="review-match"
                key={match.id}
                style={{
                  gridColumn: layout.column,
                  gridRow: `${layout.row} / span ${layout.rowSpan}`,
                }}
              >
                <span className="review-match-meta">
                  <span>{match.id}</span>
                </span>
                {match.teams.map((teamId, slotIndex) => {
                  const selected = Boolean(teamId && match.selectedWinner === teamId)
                  const result = mode === 'submission'
                    ? getKnockoutPickResult(teamId, match.selectedWinner, match.round, match.points, reviewContext)
                    : null
                  const resultClass = result ? ` result-${result.status}` : ''
                  const pointLabels = result?.pointLabels ?? []

                  return (
                    <div className={`review-pick${selected ? ' selected' : ''}${resultClass ? ` ${resultClass}` : ''}`} key={`${match.id}-${slotIndex}`}>
                      {teamId ? <TeamIdentity compact teamId={teamId} /> : <small>{match.slots[slotIndex].label}</small>}
                      {result && (
                        <span className={result.status === 'wrong' ? 'review-result-pill wrong' : 'review-result-pill correct'}>
                          {result.status === 'wrong' ? <X size={12} /> : <Check size={12} />}
                          <small>{result.label}</small>
                          {pointLabels.length > 0 && (
                            <span className="point-chip-row">
                              {pointLabels.map((label, pointIndex) => (
                                <b className="point-chip" key={`${label}-${pointIndex}`}>
                                  {label}
                                </b>
                              ))}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
              </article>
            )
          })
      ))}
    </div>
  )
}

const KNOCKOUT_ROUND_RANK: Record<KnockoutRound, number> = {
  round32: 1,
  round16: 2,
  quarterfinal: 3,
  semifinal: 4,
  final: 5,
}

const KNOCKOUT_APPEARANCE_POINTS: Record<KnockoutRound, number> = {
  round32: 0,
  round16: 4,
  quarterfinal: 8,
  semifinal: 16,
  final: 32,
}

const NEXT_APPEARANCE_ROUND: Partial<Record<KnockoutRound, KnockoutRound>> = {
  round32: 'round16',
  round16: 'quarterfinal',
  quarterfinal: 'semifinal',
  semifinal: 'final',
}

interface KnockoutReviewContext {
  actualChampion: TeamId | null
  actualTeamsByAppearanceRound: Map<KnockoutRound, Set<TeamId>>
  completedAppearanceRounds: Set<KnockoutRound>
  eliminatedRoundRankByTeam: Map<TeamId, number>
  seeded: boolean
  seededTeamIds: Set<TeamId>
}

function addTeamToRound(map: Map<KnockoutRound, Set<TeamId>>, round: KnockoutRound, teamId: TeamId) {
  const teams = map.get(round) ?? new Set<TeamId>()
  teams.add(teamId)
  map.set(round, teams)
}

function getActualKnockoutWinner(
  matchId: string,
  actualResults: ActualResults,
  matchResultsById: Map<string, MatchResult>,
) {
  return actualResults.knockoutWinners[matchId] ?? matchResultsById.get(matchId)?.winnerTeamId ?? null
}

function buildKnockoutReviewContext(actualResults: ActualResults, matchResults: MatchResult[]): KnockoutReviewContext {
  const matchResultsById = new Map(matchResults.map((matchResult) => [matchResult.id, matchResult]))
  const actualMatches = buildKnockoutMatchesFromMatchResults(buildActualPicks(actualResults), matchResults)
  const completedCountByRound = new Map<KnockoutRound, number>()
  const totalCountByRound = new Map<KnockoutRound, number>()
  const actualTeamsByAppearanceRound = new Map<KnockoutRound, Set<TeamId>>()
  const eliminatedRoundRankByTeam = new Map<TeamId, number>()
  const seededTeamIds = new Set<TeamId>()

  for (const group of GROUP_IDS) {
    const actualOrder = actualResults.groupOrder[group]
    if (!actualOrder || actualOrder.length < 4) continue

    if (actualOrder[0]) seededTeamIds.add(actualOrder[0])
    if (actualOrder[1]) seededTeamIds.add(actualOrder[1])
    if (actualResults.thirdPlaceAdvancers.includes(group) && actualOrder[2]) {
      seededTeamIds.add(actualOrder[2])
    }
  }

  for (const match of actualMatches.filter((match) => match.round === 'round32')) {
    for (const teamId of match.teams) {
      if (teamId) seededTeamIds.add(teamId)
    }
  }

  seededTeamIds.forEach((teamId) => addTeamToRound(actualTeamsByAppearanceRound, 'round32', teamId))

  const seeded = seededTeamIds.size >= 32
  if (seeded) {
    Object.keys(teamsById).forEach((teamId) => {
      if (!seededTeamIds.has(teamId)) eliminatedRoundRankByTeam.set(teamId, 0)
    })
  }

  for (const match of actualMatches) {
    totalCountByRound.set(match.round, (totalCountByRound.get(match.round) ?? 0) + 1)

    const winner = getActualKnockoutWinner(match.id, actualResults, matchResultsById)
    if (!winner) continue

    completedCountByRound.set(match.round, (completedCountByRound.get(match.round) ?? 0) + 1)

    const nextRound = NEXT_APPEARANCE_ROUND[match.round]
    if (nextRound) addTeamToRound(actualTeamsByAppearanceRound, nextRound, winner)

    for (const teamId of match.teams) {
      if (!teamId || teamId === winner) continue
      eliminatedRoundRankByTeam.set(teamId, KNOCKOUT_ROUND_RANK[match.round])
    }
  }

  const completedAppearanceRounds = new Set<KnockoutRound>()
  if (seeded) completedAppearanceRounds.add('round32')

  KNOCKOUT_ROUND_ORDER.forEach((round) => {
    const nextRound = NEXT_APPEARANCE_ROUND[round]
    if (!nextRound) return
    if ((totalCountByRound.get(round) ?? 0) > 0 && (completedCountByRound.get(round) ?? 0) === totalCountByRound.get(round)) {
      completedAppearanceRounds.add(nextRound)
    }
  })

  const actualChampion = getActualKnockoutWinner('M104', actualResults, matchResultsById)

  return {
    actualChampion,
    actualTeamsByAppearanceRound,
    completedAppearanceRounds,
    eliminatedRoundRankByTeam,
    seeded,
    seededTeamIds,
  }
}

function getKnockoutPickResult(
  teamId: TeamId | null,
  selectedWinner: TeamId | null,
  round: KnockoutRound,
  _points: number,
  reviewContext: KnockoutReviewContext,
) {
  if (!teamId) return null

  if (reviewContext.actualTeamsByAppearanceRound.get(round)?.has(teamId)) {
    const pointLabels = []
    const appearancePoints = KNOCKOUT_APPEARANCE_POINTS[round]
    if (appearancePoints > 0) pointLabels.push(`+${appearancePoints}`)
    if (round === 'final' && selectedWinner === teamId && reviewContext.actualChampion === teamId) {
      pointLabels.push('+64')
    }

    return {
      status: 'correct',
      label: round === 'round32' ? 'Qual' : 'Hit',
      pointLabels,
    }
  }

  if (reviewContext.seeded && !reviewContext.seededTeamIds.has(teamId)) {
    return { status: 'wrong', label: 'Out', pointLabels: [] }
  }

  const eliminatedRoundRank = reviewContext.eliminatedRoundRankByTeam.get(teamId)
  if (eliminatedRoundRank !== undefined && eliminatedRoundRank < KNOCKOUT_ROUND_RANK[round]) {
    return { status: 'wrong', label: 'Out', pointLabels: [] }
  }

  if (reviewContext.completedAppearanceRounds.has(round)) {
    return { status: 'wrong', label: 'Miss', pointLabels: [] }
  }

  return null
}

function ProgressRow({ label, value, complete }: { label: string; value: string; complete: boolean }) {
  return (
    <div className={complete ? 'progress-row complete' : 'progress-row'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function GroupStageBuilder({
  picks,
  readOnly,
  setPicks,
}: {
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
}) {
  return (
    <section className="section-block">
      <SectionHead
        description="Drag or tap teams into slots 1-4. The top two teams in every group automatically move into the Round of 32."
        kicker="01"
        title="Groups"
      />
      <div className="groups-grid">
        {GROUP_IDS.map((group) => (
          <GroupCard group={group} key={group} picks={picks} readOnly={readOnly} setPicks={setPicks} />
        ))}
      </div>
    </section>
  )
}

function GroupCard({
  group,
  picks,
  readOnly,
  setPicks,
}: {
  group: GroupId
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId | null>(null)
  const [pointerDragTeamId, setPointerDragTeamId] = useState<TeamId | null>(null)
  const placed = picks.groupOrder[group]
  const availableTeams = teamsByGroup[group].filter((team) => !placed.includes(team.id))

  const readDraggedTeam = (event: DragEvent) => event.dataTransfer.getData('text/plain') as TeamId
  const placeTeam = (teamId: TeamId, index: number) => {
    setPicks((current) => placeTeamInGroup(current, group, teamId, index))
    setSelectedTeamId(null)
  }
  const placeSelectedTeam = (index: number) => {
    if (readOnly || !selectedTeamId) return
    placeTeam(selectedTeamId, index)
  }
  const beginPointerDrag = (event: PointerEvent<HTMLDivElement>, teamId: TeamId) => {
    if (readOnly || event.pointerType === 'mouse') return
    setPointerDragTeamId(teamId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>, fallbackTeamId: TeamId) => {
    if (readOnly || event.pointerType === 'mouse') return

    const teamId = pointerDragTeamId ?? fallbackTeamId
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)
    const slot = target?.closest<HTMLElement>(`[data-group="${group}"][data-rank-index]`)
    const pool = target?.closest<HTMLElement>(`[data-group-pool="${group}"]`)

    if (slot?.dataset.rankIndex) {
      placeTeam(teamId, Number(slot.dataset.rankIndex))
    } else if (pool) {
      setPicks((current) => removeTeamFromGroup(current, group, teamId))
    }

    setPointerDragTeamId(null)
  }

  return (
    <article className={pointerDragTeamId ? 'group-card touch-dragging' : 'group-card'}>
      <header>
        <span>Group {group}</span>
        <small>{placed.filter(Boolean).length}/4</small>
      </header>

      <div
        className="team-pool"
        data-group-pool={group}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (readOnly) return
          const teamId = readDraggedTeam(event)
          setPicks((current) => removeTeamFromGroup(current, group, teamId))
        }}
      >
        {availableTeams.map((team) => (
          <TeamToken
            dragging={pointerDragTeamId === team.id}
            group={group}
            key={team.id}
            onSelect={() => setSelectedTeamId(team.id)}
            onPointerCancel={() => setPointerDragTeamId(null)}
            onPointerFinish={finishPointerDrag}
            onPointerStart={beginPointerDrag}
            readOnly={readOnly}
            selected={selectedTeamId === team.id}
            teamId={team.id}
          />
        ))}
      </div>

      <ol className="rank-slots">
        {[0, 1, 2, 3].map((index) => {
          const teamId = placed[index]

          return (
            <li
              className={teamId ? 'rank-slot filled' : 'rank-slot'}
              data-group={group}
              data-rank-index={index}
              key={index}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (readOnly) return
                const draggedTeamId = readDraggedTeam(event)
                placeTeam(draggedTeamId, index)
              }}
              onClick={() => placeSelectedTeam(index)}
            >
              <span className="slot-number">{index + 1}</span>
              {teamId ? (
                <TeamToken
                  dragging={pointerDragTeamId === teamId}
                  group={group}
                  onSelect={() => setSelectedTeamId(teamId)}
                  onPointerCancel={() => setPointerDragTeamId(null)}
                  onPointerFinish={finishPointerDrag}
                  onPointerStart={beginPointerDrag}
                  readOnly={readOnly}
                  selected={selectedTeamId === teamId}
                  teamId={teamId}
                />
              ) : (
                <span className="slot-empty">Tap/drop</span>
              )}
            </li>
          )
        })}
      </ol>
    </article>
  )
}

function TeamToken({
  group,
  onSelect,
  onPointerCancel,
  onPointerFinish,
  onPointerStart,
  readOnly,
  selected,
  teamId,
  dragging,
}: {
  group: GroupId
  dragging: boolean
  onSelect: () => void
  onPointerCancel: () => void
  onPointerFinish: (event: PointerEvent<HTMLDivElement>, teamId: TeamId) => void
  onPointerStart: (event: PointerEvent<HTMLDivElement>, teamId: TeamId) => void
  readOnly: boolean
  selected: boolean
  teamId: TeamId
}) {
  const team = teamsById[teamId]

  return (
    <div
      aria-label={team.name}
      className={`${readOnly ? 'team-token readonly' : 'team-token'}${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
      draggable={!readOnly}
      onClick={(event) => {
        event.stopPropagation()
        if (!readOnly) onSelect()
      }}
      onDragStart={(event) => {
        if (readOnly) return
        event.dataTransfer.setData('text/plain', teamId)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onPointerCancel={onPointerCancel}
      onPointerDown={(event) => onPointerStart(event, teamId)}
      onPointerUp={(event) => onPointerFinish(event, teamId)}
    >
      <GripVertical size={13} />
      <TeamIdentity teamId={teamId} compact />
      <InfoHover teamId={teamId} label={`About ${team.name} in Group ${group}`} />
    </div>
  )
}

function TeamIdentity({ teamId, compact = false }: { teamId: TeamId; compact?: boolean }) {
  const team = teamsById[teamId]

  return (
    <span className={compact ? 'team-identity compact' : 'team-identity'}>
      <span className="flag-frame">
        <img alt="" src={getFlagUrl(team.countryCode)} />
      </span>
      <span>
        <strong>{team.shortName}</strong>
        {!compact && <small>{getTeamSeedLabel(team.id)}</small>}
      </span>
    </span>
  )
}

function InfoHover({ teamId, label }: { teamId: TeamId; label: string }) {
  return (
    <span
      aria-label={label}
      className="info-hover"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      role="button"
      tabIndex={0}
    >
      <Info size={14} />
      <TeamHoverCard teamId={teamId} />
    </span>
  )
}

function TeamHoverCard({ teamId }: { teamId: TeamId }) {
  const team = teamsById[teamId]

  return (
    <span className="team-hover-card" role="tooltip">
      <span className="hover-card-head">
        <span className="flag-frame large">
          <img alt="" src={getFlagUrl(team.countryCode)} />
        </span>
        <span>
          <strong>{team.name}</strong>
          <small>
            FIFA {team.fifaRank} · {team.confederation}
          </small>
        </span>
      </span>
      <span className="stat-grid">
        <span>
          <small>Group</small>
          <strong>{team.group}</strong>
        </span>
        <span>
          <small>Rank</small>
          <strong>{team.fifaRank}</strong>
        </span>
        <span>
          <small>WC apps</small>
          <strong>{team.appearances}</strong>
        </span>
        <span>
          <small>Best</small>
          <strong>{team.bestFinish}</strong>
        </span>
      </span>
      <span className="hover-players">
        {team.keyPlayers.map((player) => (
          <span key={player.name}>
            <strong>{player.name}</strong>
          </span>
        ))}
      </span>
    </span>
  )
}

function ThirdPlaceSelector({
  groupStageComplete,
  picks,
  readOnly,
  setPicks,
}: {
  groupStageComplete: boolean
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
}) {
  return (
    <section className="section-block">
      <SectionHead
        description="Pick the eight third-place teams you think will have the best points and tiebreakers; they also enter the Round of 32."
        kicker="02"
        stat={`${picks.thirdPlaceAdvancers.length}/8`}
        title="Third-place teams"
      />
      <div className={groupStageComplete ? 'third-grid' : 'third-grid locked'}>
        {GROUP_IDS.map((group) => {
          const thirdTeamId = picks.groupOrder[group][2]
          const checked = picks.thirdPlaceAdvancers.includes(group)
          const disabled = readOnly || !groupStageComplete || (!checked && picks.thirdPlaceAdvancers.length >= 8)

          return (
            <button
              className={checked ? 'third-card selected' : 'third-card'}
              disabled={disabled}
              key={group}
              onClick={() => setPicks((current) => toggleThirdPlace(current, group))}
              type="button"
            >
              <span>{checked ? <Check size={14} /> : group}</span>
              {thirdTeamId ? <TeamIdentity teamId={thirdTeamId} compact /> : <small>Empty</small>}
              {thirdTeamId && <InfoHover label={`About ${teamsById[thirdTeamId].name}`} teamId={thirdTeamId} />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function KnockoutBuilder({
  picks,
  readOnly,
  setPicks,
}: {
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
}) {
  const matches = buildResolvedBracket(picks)

  return (
    <section className="section-block knockout-section">
      <SectionHead
        description="Choose each knockout winner from the Round of 32 through the final. Each pick unlocks the next matchup."
        kicker="03"
        title="Knockout"
      />
      <div className="classic-bracket">
        {KNOCKOUT_ROUND_ORDER.map((round) => {
          const roundMatches = matches.filter((match) => match.round === round)

          return roundMatches
            .sort((left, right) => knockoutLayout[left.id].row - knockoutLayout[right.id].row)
            .map((match) => {
              const layout = knockoutLayout[match.id]

              return (
                <article
                  className={round === 'final' ? 'classic-match final' : 'classic-match'}
                  key={match.id}
                  style={{
                    gridColumn: layout.column,
                    gridRow: `${layout.row} / span ${layout.rowSpan}`,
                  }}
                >
                  <header>
                    <span>{match.id}</span>
                    <small>{match.date}</small>
                  </header>
                  {match.teams.map((teamId, slotIndex) => (
                    <TeamPickButton
                      fallbackLabel={match.slots[slotIndex].label}
                      key={`${match.id}-${slotIndex}`}
                      onPick={(winnerId) => {
                        if (readOnly) return
                        setPicks((current) => setWinner(current, match.id, winnerId))
                      }}
                      readOnly={readOnly}
                      selected={Boolean(teamId && match.selectedWinner === teamId)}
                      teamId={teamId}
                    />
                  ))}
                </article>
              )
            })
        })}
      </div>
    </section>
  )
}

function TeamPickButton({
  fallbackLabel,
  selected,
  teamId,
  onPick,
  readOnly,
}: {
  fallbackLabel: string
  selected: boolean
  teamId: TeamId | null
  onPick: (teamId: TeamId) => void
  readOnly: boolean
}) {
  if (!teamId) {
    return (
      <button className="team-pick empty" disabled type="button">
        {fallbackLabel}
      </button>
    )
  }

  const team = teamsById[teamId]

  return (
    <button
      aria-disabled={readOnly}
      className={`${selected ? 'team-pick selected' : 'team-pick'}${readOnly ? ' readonly' : ''}`}
      onClick={() => onPick(teamId)}
      type="button"
    >
      <TeamIdentity teamId={teamId} compact />
      <span className="pick-side">
        <span>{team.code}</span>
        <InfoHover label={`About ${team.name}`} teamId={teamId} />
      </span>
    </button>
  )
}

function SectionHead({
  description,
  kicker,
  title,
  stat,
}: {
  description?: string
  kicker: string
  title: string
  stat?: string
}) {
  return (
    <div className="section-head">
      <div>
        <p className="kicker">{kicker}</p>
        <h2>{title}</h2>
        {description && <p className="section-copy">{description}</p>}
      </div>
      {stat && <span>{stat}</span>}
    </div>
  )
}

function buildActualPicks(actualResults: ActualResults): BracketPicks {
  const groupOrder = GROUP_IDS.reduce(
    (order, group) => {
      const actualOrder = actualResults.groupOrder[group] ?? []
      order[group] = [
        actualOrder[0] ?? null,
        actualOrder[1] ?? null,
        actualOrder[2] ?? null,
        actualOrder[3] ?? null,
      ]
      return order
    },
    {} as BracketPicks['groupOrder'],
  )

  return {
    groupOrder,
    thirdPlaceAdvancers: actualResults.thirdPlaceAdvancers,
    knockoutWinners: actualResults.knockoutWinners,
  }
}

function hasActualResults(actualResults: ActualResults) {
  return GROUP_IDS.some((group) => (actualResults.groupOrder[group]?.length ?? 0) >= 4) || Object.keys(actualResults.knockoutWinners).length > 0
}

function getKnockoutPickProgress(picks: BracketPicks) {
  const matches = buildResolvedBracket(picks)
  const completed = matches.filter((match) =>
    match.teams.every((teamId) => Boolean(teamId)) && Boolean(match.selectedWinner),
  ).length

  return {
    completed,
    total: matches.length,
  }
}

function formatResultDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(isoDate))
}

function scheduleTeam(teamId: TeamId | null, fallbackLabel: string): ScheduleTeam {
  return {
    teamId,
    label: teamId ? teamsById[teamId]?.shortName ?? fallbackLabel : fallbackLabel,
  }
}

function getScheduleTimestamp(date: string, time: string) {
  const [, monthText, dayText] = /^(Jun|Jul) (\d{1,2})$/.exec(date) ?? []
  const [, hourText, minuteText, meridiem] = /^(\d{1,2}):(\d{2}) (AM|PM) ET$/.exec(time) ?? []
  const month = monthText === 'Jul' ? 6 : 5
  const day = Number(dayText)

  if (!monthText || !Number.isFinite(day)) return Number.MAX_SAFE_INTEGER
  if (!hourText || !minuteText || !meridiem) {
    return Date.UTC(2026, month, day, 23, 59)
  }

  const hour = (Number(hourText) % 12) + (meridiem === 'PM' ? 12 : 0)
  return Date.UTC(2026, month, day, hour, Number(minuteText))
}

function formatEasternDate(isoUtc: string) {
  return EASTERN_DATE_FORMAT.format(new Date(isoUtc))
}

function formatEasternTime(isoUtc: string) {
  return `${EASTERN_TIME_FORMAT.format(new Date(isoUtc)).replace(/\u202f/g, ' ')} ET`
}

function getTimelineStatus(status: string): ScheduleFixture['status'] {
  const normalized = status.toLowerCase()
  if (['final', 'ft', 'aet', 'pen', 'post', 'completed'].includes(normalized)) return 'completed'
  if (['live', 'in', 'in_progress', '1h', '2h', 'ht', 'et', 'p'].includes(normalized)) return 'live'
  return 'upcoming'
}

function applyMatchResult(fixture: ScheduleFixture, matchResult?: MatchResult): ScheduleFixture {
  if (!matchResult) return fixture

  const status = getTimelineStatus(matchResult.status)
  const hasScore = typeof matchResult.homeScore === 'number' && typeof matchResult.awayScore === 'number'
  const hasKnownTeams = Boolean(
    matchResult.homeTeamId &&
      matchResult.awayTeamId &&
      teamsById[matchResult.homeTeamId] &&
      teamsById[matchResult.awayTeamId],
  )

  return {
    ...fixture,
    teams: hasKnownTeams
      ? [
          scheduleTeam(matchResult.homeTeamId ?? null, fixture.teams[0].label),
          scheduleTeam(matchResult.awayTeamId ?? null, fixture.teams[1].label),
        ]
      : fixture.teams,
    score: hasScore ? [matchResult.homeScore ?? 0, matchResult.awayScore ?? 0] : fixture.score,
    status,
    statusDetail: matchResult.statusDetail,
    displayClock: matchResult.displayClock,
    winnerId: matchResult.winnerTeamId ?? fixture.winnerId,
  }
}

function buildGroupSchedule(actualResults: ActualResults): ScheduleFixture[] {
  return GROUP_STAGE_FIXTURES.map(([id, group, isoUtc, venue, [leftTeamId, rightTeamId]]) => {
    const actualOrder = actualResults.groupOrder[group] ?? []
    const groupComplete = actualOrder.length >= 4
    const teams = [scheduleTeam(leftTeamId, `Group ${group}`), scheduleTeam(rightTeamId, `Group ${group}`)] as [ScheduleTeam, ScheduleTeam]
    const leftActualIndex = actualOrder.indexOf(leftTeamId)
    const rightActualIndex = actualOrder.indexOf(rightTeamId)
    const winnerId = groupComplete && leftActualIndex !== -1 && rightActualIndex !== -1
      ? leftActualIndex < rightActualIndex
        ? leftTeamId
        : rightTeamId
      : null

    return {
      id,
      date: formatEasternDate(isoUtc),
      time: formatEasternTime(isoUtc),
      startsAt: Date.parse(isoUtc),
      venue,
      teams,
      label: `Group ${group}`,
      status: groupComplete ? 'completed' : 'upcoming',
      winnerId,
    }
  })
}

function buildLiveSchedule(actualResults: ActualResults, matchResults: MatchResult[] = []): ScheduleFixture[] {
  const matchResultsById = new Map(matchResults.map((matchResult) => [matchResult.id, matchResult]))
  const actualPicks = buildActualPicks(actualResults)
  const groupSchedule = buildGroupSchedule(actualResults).map((fixture) =>
    applyMatchResult(fixture, matchResultsById.get(fixture.id)),
  )
  const bracketSchedule = buildResolvedBracket(actualPicks).map((match) => {
    const teams = [
      scheduleTeam(match.teams[0], match.slots[0].label),
      scheduleTeam(match.teams[1], match.slots[1].label),
    ] as [ScheduleTeam, ScheduleTeam]
    const winnerId = actualResults.knockoutWinners[match.id] ?? null

    return applyMatchResult({
      id: match.id,
      date: match.date,
      time: KNOCKOUT_TIMES[match.id] ?? 'TBD',
      startsAt: getScheduleTimestamp(match.date, KNOCKOUT_TIMES[match.id] ?? 'TBD'),
      venue: match.venue,
      teams,
      label: match.label,
      status: winnerId ? 'completed' : 'upcoming',
      winnerId,
    } satisfies ScheduleFixture, matchResultsById.get(match.id))
  })
  const thirdPlaceSchedule = applyMatchResult({
    id: THIRD_PLACE_FIXTURE.id,
    date: formatEasternDate(THIRD_PLACE_FIXTURE.isoUtc),
    time: formatEasternTime(THIRD_PLACE_FIXTURE.isoUtc),
    startsAt: Date.parse(THIRD_PLACE_FIXTURE.isoUtc),
    venue: THIRD_PLACE_FIXTURE.venue,
    teams: [
      scheduleTeam(null, 'Semifinal 1 loser'),
      scheduleTeam(null, 'Semifinal 2 loser'),
    ] as [ScheduleTeam, ScheduleTeam],
    label: 'Third-place',
    status: 'upcoming',
    winnerId: null,
  } satisfies ScheduleFixture, matchResultsById.get(THIRD_PLACE_FIXTURE.id))

  return [...groupSchedule, ...bracketSchedule, thirdPlaceSchedule].sort((left, right) => {
    const timeDelta = left.startsAt - right.startsAt
    if (timeDelta !== 0) return timeDelta
    return left.id.localeCompare(right.id)
  })
}

function RulesInfoHover() {
  return (
    <div className="rules-info">
      <button aria-label="Scoring rules" className="rules-info-button" type="button">
        <Info size={14} />
      </button>
      <div className="rules-popover" role="tooltip">
        <ScoringCard compact />
      </div>
    </div>
  )
}

function OfficialResultsPanel({
  actualResults,
  currentGroupTables,
  matchResults,
}: {
  actualResults: ActualResults
  currentGroupTables: CurrentGroupTable[]
  matchResults: MatchResult[]
}) {
  const actualPicks = useMemo(() => buildActualPicks(actualResults), [actualResults])
  const currentKnockoutPicks = useMemo(
    () => buildCurrentStandingsKnockoutPicks(currentGroupTables),
    [currentGroupTables],
  )
  const officialKnockoutMatches = useMemo(
    () => buildKnockoutMatchesFromMatchResults(currentKnockoutPicks, matchResults),
    [currentKnockoutPicks, matchResults],
  )
  const officialThirdPlaceAdvancers = useMemo(
    () => getThirdPlaceAdvancersFromRoundOf32(currentKnockoutPicks.groupOrder, matchResults),
    [currentKnockoutPicks.groupOrder, matchResults],
  )
  const countedGroupCount = currentGroupTables.filter((table) => table.countedMatches > 0).length
  const hasCurrentStandings = countedGroupCount > 0
  const hasResults = hasActualResults(actualResults)
  const roundOf32KnownSlots = countKnownRoundOf32TeamSlots(matchResults)
  const groupStageResolved = roundOf32KnownSlots >= 32 ||
    GROUP_IDS.every((group) => (actualResults.groupOrder[group]?.length ?? 0) >= 4)
  const activeThirdPlaceAdvancers = officialThirdPlaceAdvancers.length > 0
    ? officialThirdPlaceAdvancers
    : currentKnockoutPicks.thirdPlaceAdvancers

  return (
    <section className="official-results-panel">
      <div className="official-results-head">
        <div>
          <p className="kicker">{groupStageResolved ? 'Group stage final' : hasCurrentStandings ? 'Current standings' : 'Official results'}</p>
          <strong>
            {groupStageResolved
              ? 'Knockout bracket set'
              : hasCurrentStandings
              ? `${countedGroupCount}/12 groups active`
              : hasResults
                ? `Updated ${formatResultDate(actualResults.updatedAt)}`
                : 'Waiting for Matchday 1'}
          </strong>
        </div>
        <span>{groupStageResolved ? 'Official' : hasCurrentStandings ? 'Provisional' : actualResults.source}</span>
      </div>

      {hasCurrentStandings ? (
        <div className="current-results-stack">
          <CurrentStandingsGrid
            currentGroupTables={currentGroupTables}
            thirdPlaceAdvancers={activeThirdPlaceAdvancers}
          />
          <CurrentKnockoutProjection
            isFinal={groupStageResolved}
            knownSlots={roundOf32KnownSlots}
            matches={roundOf32KnownSlots > 0 ? officialKnockoutMatches : undefined}
            picks={currentKnockoutPicks}
          />
        </div>
      ) : !hasResults ? (
        <div className="official-empty">Correct results will appear here once games are complete.</div>
      ) : (
        <div className="official-review-stack">
          <ReviewGroups actualResults={actualResults} mode="official" picks={actualPicks} />
          <ReviewBracket actualResults={actualResults} mode="official" picks={actualPicks} />
        </div>
      )}
    </section>
  )
}

function buildCurrentStandingsKnockoutPicks(currentGroupTables: CurrentGroupTable[]): BracketPicks {
  const tablesByGroup = new Map(currentGroupTables.map((table) => [table.group, table]))
  const groupOrder = GROUP_IDS.reduce(
    (order, group) => {
      const standings = tablesByGroup.get(group)?.standings ?? []
      order[group] = [
        standings[0]?.teamId ?? null,
        standings[1]?.teamId ?? null,
        standings[2]?.teamId ?? null,
        standings[3]?.teamId ?? null,
      ]
      return order
    },
    {} as BracketPicks['groupOrder'],
  )

  const thirdPlaceAdvancers = currentGroupTables
    .map((table) => table.standings[2])
    .filter((standing): standing is NonNullable<typeof standing> => Boolean(standing))
    .sort((left, right) => {
      const pointsDelta = right.points - left.points
      if (pointsDelta !== 0) return pointsDelta

      const goalDifferenceDelta = right.goalDifference - left.goalDifference
      if (goalDifferenceDelta !== 0) return goalDifferenceDelta

      const goalsForDelta = right.goalsFor - left.goalsFor
      if (goalsForDelta !== 0) return goalsForDelta

      const winsDelta = right.wins - left.wins
      if (winsDelta !== 0) return winsDelta

      const rankDelta = teamsById[left.teamId].fifaRank - teamsById[right.teamId].fifaRank
      if (rankDelta !== 0) return rankDelta

      return GROUP_IDS.indexOf(left.group) - GROUP_IDS.indexOf(right.group)
    })
    .slice(0, 8)
    .map((standing) => standing.group)

  return {
    groupOrder,
    thirdPlaceAdvancers,
    knockoutWinners: {},
  }
}

function buildKnockoutMatchesFromMatchResults(picks: BracketPicks, matchResults: MatchResult[]): ResolvedMatch[] {
  const matchesById = new Map(matchResults.map((matchResult) => [matchResult.id, matchResult]))

  return buildResolvedBracket(picks).map((match) => {
    const matchResult = matchesById.get(match.id)
    const teams = [
      matchResult?.homeTeamId ?? match.teams[0],
      matchResult?.awayTeamId ?? match.teams[1],
    ] as [TeamId | null, TeamId | null]
    const selectedWinner = match.selectedWinner && teams.includes(match.selectedWinner)
      ? match.selectedWinner
      : null

    return {
      ...match,
      teams,
      selectedWinner,
    }
  })
}

function countKnownRoundOf32TeamSlots(matchResults: MatchResult[]) {
  return matchResults.reduce((count, matchResult) => {
    if (!ROUND_OF_32_MATCH_ID_SET.has(matchResult.id)) return count
    return count + (matchResult.homeTeamId ? 1 : 0) + (matchResult.awayTeamId ? 1 : 0)
  }, 0)
}

function getThirdPlaceAdvancersFromRoundOf32(
  groupOrder: BracketPicks['groupOrder'],
  matchResults: MatchResult[],
): GroupId[] {
  const roundOf32TeamIds = new Set<TeamId>()

  for (const matchResult of matchResults) {
    if (!ROUND_OF_32_MATCH_ID_SET.has(matchResult.id)) continue
    if (matchResult.homeTeamId) roundOf32TeamIds.add(matchResult.homeTeamId)
    if (matchResult.awayTeamId) roundOf32TeamIds.add(matchResult.awayTeamId)
  }

  return GROUP_IDS.filter((group) => {
    const thirdPlaceTeamId = groupOrder[group][2]
    return Boolean(thirdPlaceTeamId && roundOf32TeamIds.has(thirdPlaceTeamId))
  })
}

function CurrentKnockoutProjection({
  isFinal,
  knownSlots,
  matches,
  picks,
}: {
  isFinal: boolean
  knownSlots: number
  matches?: ResolvedMatch[]
  picks: BracketPicks
}) {
  return (
    <section className="current-knockout-projection">
      <div className="current-knockout-head">
        <div>
          <p className="kicker">Knockout</p>
          <strong>{isFinal ? 'Knockout bracket' : 'If standings held'}</strong>
        </div>
        <span>{isFinal ? 'Round of 32 set' : knownSlots > 0 ? `${knownSlots}/32 slots known` : 'Round of 32 seeded'}</span>
      </div>
      <div className="current-knockout-scroll">
        <KnockoutReviewGrid matches={matches} mode="official" picks={picks} />
      </div>
    </section>
  )
}

function CurrentStandingsGrid({
  currentGroupTables,
  thirdPlaceAdvancers,
}: {
  currentGroupTables: CurrentGroupTable[]
  thirdPlaceAdvancers: GroupId[]
}) {
  return (
    <div className="current-standings-grid">
      {currentGroupTables.map((table) => {
        const groupStarted = table.countedMatches > 0

        return (
          <article className={groupStarted ? 'standings-card active' : 'standings-card'} key={table.group}>
            <header>
              <strong>Group {table.group}</strong>
              <span>{table.countedMatches}/6</span>
            </header>
            <div className="standings-table">
              <div className="standings-row standings-header">
                <span>#</span>
                <span>Team</span>
                <span>W-D-L</span>
                <span>GD</span>
                <span>Pts</span>
              </div>
              {table.standings.map((standing, index) => {
                const qualifies = groupStarted && (index < 2 || (index === 2 && thirdPlaceAdvancers.includes(table.group)))

                return (
                  <div className={qualifies ? 'standings-row qualifies' : 'standings-row'} key={standing.teamId}>
                    <span>{index + 1}</span>
                    <StandingsTeamIdentity teamId={standing.teamId} />
                    <span>{standing.wins}-{standing.draws}-{standing.losses}</span>
                    <span>{standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}</span>
                    <strong>{standing.points}</strong>
                  </div>
                )
              })}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function StandingsTeamIdentity({ teamId }: { teamId: TeamId }) {
  const team = teamsById[teamId]

  return (
    <span className="standings-team" title={team.name}>
      <span className="flag-frame">
        <img alt="" src={getFlagUrl(team.countryCode)} />
      </span>
      <strong>{team.code}</strong>
    </span>
  )
}

function LiveSchedulePanel({ actualResults, matchResults }: { actualResults: ActualResults; matchResults: MatchResult[] }) {
  const fixtures = useMemo(() => buildLiveSchedule(actualResults, matchResults), [actualResults, matchResults])
  const listRef = useRef<HTMLDivElement | null>(null)
  const completedCount = fixtures.filter((fixture) => fixture.status === 'completed').length
  const liveCount = fixtures.filter((fixture) => fixture.status === 'live').length
  const upcomingCount = fixtures.filter((fixture) => fixture.status === 'upcoming').length

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const firstLive = list.querySelector<HTMLElement>('.schedule-row.live')
    const firstUpcoming = list.querySelector<HTMLElement>('.schedule-row.upcoming')
    const target = firstLive ?? firstUpcoming ?? list.lastElementChild
    if (!(target instanceof HTMLElement)) return

    list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 8)
  }, [fixtures])

  return (
    <aside className="schedule-panel">
      <div className="schedule-head">
        <div>
          <p className="kicker">Live schedule</p>
          <strong>Match timeline</strong>
        </div>
        <span>{completedCount}/{fixtures.length}</span>
      </div>
      <div className="schedule-list" ref={listRef}>
        {fixtures.map((fixture, index) => {
          const previousStatus = fixtures[index - 1]?.status
          const showStatusDivider = index === 0 || previousStatus !== fixture.status
          const statusLabel = fixture.status === 'completed'
            ? 'Completed'
            : fixture.status === 'live'
              ? 'Live'
              : 'Upcoming'
          const statusCountLabel = fixture.status === 'completed'
            ? `${completedCount} final`
            : fixture.status === 'live'
              ? `${liveCount} live`
              : `${upcomingCount} to play`
          const timeLabel = fixture.status === 'completed'
            ? 'FT'
            : fixture.status === 'live'
              ? fixture.displayClock && fixture.displayClock !== "0'"
                ? fixture.displayClock
                : fixture.statusDetail ?? 'LIVE'
              : fixture.time

          return (
            <Fragment key={fixture.id}>
              {showStatusDivider && (
                <div className={`schedule-section-label ${fixture.status}`}>
                  <span>{statusLabel}</span>
                  <b>{statusCountLabel}</b>
                </div>
              )}
              <article className={`schedule-row ${fixture.status}`}>
                <div className="schedule-meta">
                  <span>{fixture.date}</span>
                  <span className="schedule-time">{timeLabel}</span>
                </div>
                <div className="schedule-teams">
                  <ScheduleTeamIdentity team={fixture.teams[0]} winner={fixture.status === 'completed' && fixture.teams[0].teamId === fixture.winnerId} />
                  <small className={fixture.score ? 'schedule-score' : ''}>
                    {fixture.score ? `${fixture.score[0]}-${fixture.score[1]}` : 'vs'}
                  </small>
                  <ScheduleTeamIdentity team={fixture.teams[1]} winner={fixture.status === 'completed' && fixture.teams[1].teamId === fixture.winnerId} />
                </div>
                <div className="schedule-place">
                  <span>{fixture.label}</span>
                  <strong>{fixture.venue}</strong>
                </div>
              </article>
            </Fragment>
          )
        })}
      </div>
    </aside>
  )
}

function ScheduleTeamIdentity({ team, winner = false }: { team: ScheduleTeam; winner?: boolean }) {
  return team.teamId ? (
    <span className={winner ? 'schedule-team winner' : 'schedule-team'}>
      <TeamIdentity compact teamId={team.teamId} />
    </span>
  ) : (
    <span className={winner ? 'schedule-team winner schedule-placeholder' : 'schedule-team schedule-placeholder'}>{team.label}</span>
  )
}

function LeaderboardPanel({
  actualResults,
  currentGroupTables,
  entries,
  matchResults,
  room,
  scoringResults,
  previewSubmission,
  provisionalGroupCount,
  onPreview,
}: {
  actualResults: ActualResults
  currentGroupTables: CurrentGroupTable[]
  entries: ReturnType<typeof buildLeaderboard>
  matchResults: MatchResult[]
  room: Room
  scoringResults: ActualResults
  previewSubmission: BracketSubmission | null
  provisionalGroupCount: number
  onPreview: (submission: BracketSubmission | null) => void
}) {
  const selectedSubmission = previewSubmission
  const displaySubmission = useMemo(
    () => selectedSubmission ? normalizeBracketPicks(selectedSubmission) : null,
    [selectedSubmission],
  )
  const actualMapStages = useMemo(() => getActualTeamMapStages(scoringResults), [scoringResults])
  const isProvisional = provisionalGroupCount > 0
  const resultsMapNote = isProvisional
    ? 'Live group table feeding scores'
    : 'Group stage final; knockout results update here'

  return (
    <div className={selectedSubmission ? 'leaderboard-shell with-detail' : 'leaderboard-shell'}>
      <section className="leaderboard-main">
        <div className="board-topline">
          <span>{room.name}</span>
          <div className="board-title-row">
            <RulesInfoHover />
            <strong>Leaderboard</strong>
            {isProvisional && <em className="score-mode-pill">Live table</em>}
          </div>
        </div>
        <div className="board-primary">
          <div className="leaderboard-table">
            <div className="leaderboard-header">
              <span>#</span>
              <span>Entry</span>
              <span>Adv</span>
              <span>Place</span>
              <span>KO</span>
              <span>Max</span>
              <span>{isProvisional ? 'Live' : 'Score'}</span>
            </div>
            {entries.map((entry, index) => {
              const championId = entry.champion
              const selected = selectedSubmission?.id === entry.submission.id

              return (
                <button
                  className={selected ? 'leader-row selected' : 'leader-row'}
                  key={entry.submission.id}
                  onClick={() => onPreview(selected ? null : entry.submission)}
                  type="button"
                >
                  <span className="leader-rank">{index + 1}</span>
                  <span className="leader-name">
                    <strong>
                      {championId && <ChampionFlag teamId={championId} />}
                      {entry.submission.ownerName}
                    </strong>
                    <small>{submissionSourceLabel(entry.submission.source)}</small>
                  </span>
                  <span className="leader-stat optional">
                    <strong>{entry.score.groupAdvancement}</strong>
                  </span>
                  <span className="leader-stat optional">
                    <strong>{entry.score.groupPlacement}</strong>
                  </span>
                  <span className="leader-stat optional">
                    <strong>{entry.score.knockout}</strong>
                  </span>
                  <span className="leader-stat optional">
                    <strong>{entry.score.possible}</strong>
                  </span>
                  <span className="leader-stat primary">
                    <strong>{entry.score.total}</strong>
                  </span>
                </button>
              )
            })}
          </div>
          <WorldCupMap
            compact
            kicker="Map"
            note={resultsMapNote}
            stages={actualMapStages}
            title="Results"
          />
          <OfficialResultsPanel actualResults={actualResults} currentGroupTables={currentGroupTables} matchResults={matchResults} />
        </div>
      </section>

      {selectedSubmission ? (
        <aside className="detail-rail">
          {displaySubmission && (
            <>
              <BracketSummary actualResults={scoringResults} matchResults={matchResults} onClose={() => onPreview(null)} submission={selectedSubmission} />
              <div className="detail-review-stack">
                <ReviewBracket actualResults={scoringResults} matchResults={matchResults} picks={displaySubmission} />
                <ReviewGroups actualResults={scoringResults} picks={displaySubmission} />
              </div>
            </>
          )}
        </aside>
      ) : (
        <LiveSchedulePanel actualResults={actualResults} matchResults={matchResults} />
      )}
    </div>
  )
}

function ChampionFlag({ teamId }: { teamId: TeamId }) {
  const team = teamsById[teamId]

  return (
    <span className="champion-flag" title={team.name}>
      <img alt="" src={getFlagUrl(team.countryCode)} />
    </span>
  )
}

function BracketSummary({
  actualResults,
  matchResults,
  submission,
  onClose,
}: {
  actualResults: ActualResults
  matchResults: MatchResult[]
  submission: BracketSubmission
  onClose: () => void
}) {
  const champion = getStoredChampion(submission)
  const score = scoreSubmission(submission, actualResults, matchResults)

  return (
    <section className="panel bracket-summary">
      <div className="detail-panel-head">
        <p className="kicker">Submission</p>
        <button aria-label="Close submission detail" className="icon-button" onClick={onClose} type="button">
          <X size={15} />
        </button>
      </div>
      <h2>{submission.ownerName}</h2>
      {champion && (
        <div className="champion-banner">
          <Trophy size={17} />
          <TeamIdentity compact teamId={champion} />
        </div>
      )}
      <div className="score-breakdown">
        <ProgressRow complete={score.groupAdvancement > 0} label="Advancement" value={String(score.groupAdvancement)} />
        <ProgressRow complete={score.groupPlacement > 0} label="Placement" value={String(score.groupPlacement)} />
        <ProgressRow complete={score.knockout > 0} label="Knockout" value={String(score.knockout)} />
      </div>
    </section>
  )
}

function ScoringCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'scoring-card compact' : 'panel scoring-card'}>
      <p className="kicker">Scoring</p>
      <div className="score-rule-grid">
        <span>Correct advancer</span>
        <strong>+2</strong>
        <span>Exact group winner</span>
        <strong>+3</strong>
        <span>Exact runner-up</span>
        <strong>+2</strong>
        <span>Exact third place</span>
        <strong>+1</strong>
        <span>R16 / QF / SF</span>
        <strong>4 / 8 / 16</strong>
        <span>Finalist / champ</span>
        <strong>32 / 64</strong>
      </div>
    </section>
  )
}

export default App
