import {
  Check,
  FileCheck2,
  GripVertical,
  Info,
  Lock,
  Mail,
  PencilLine,
  Save,
  ShieldCheck,
  Table2,
  Trophy,
  User,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import './App.css'
import { WorldCupMap } from './components/WorldCupMap'
import { demoActualResults, emptyActualResults } from './data/results'
import { roomBySlug } from './data/rooms'
import { teamsByGroup, teamsById } from './data/teams'
import {
  buildResolvedBracket,
  createInitialPicks,
  formatEmailName,
  getChampion,
  getFlagUrl,
  getGroupWinners,
  getTeamSeedLabel,
  isBracketComplete,
  isGroupStageComplete,
  placeTeamInGroup,
  removeTeamFromGroup,
  setWinner,
  toggleThirdPlace,
} from './lib/bracket'
import { buildLeaderboard, scoreSubmission } from './lib/scoring'
import { getActualTeamMapStages, getPredictionTeamMapStages } from './lib/mapProgress'
import {
  fetchRemoteActualResults,
  fetchRemoteSubmissions,
  sendRemoteEmailCode,
  submitRemoteBracket,
  subscribeToRemotePoolUpdates,
  verifyRemoteEmailCode,
} from './lib/poolRepository'
import { sampleSubmissions } from './lib/sampleSubmissions'
import {
  loadLocalSubmissions,
  loadStoredRoomSession,
  saveLocalSubmissions,
  saveStoredRoomSession,
  upsertLocalSubmission,
} from './lib/storage'
import { hasSupabaseConfig } from './lib/supabaseClient'
import { GROUP_IDS, type ActualResults, type BracketPicks, type BracketSubmission, type GroupId, type Room, type TeamId } from './types'

type AppStep = 'gate' | 'name' | 'email' | 'rulesIntro' | 'build' | 'leaderboard'
type ResultsMode = 'pre' | 'demo'

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
  venue: string
  teams: [ScheduleTeam, ScheduleTeam]
  label: string
  status: 'completed' | 'upcoming'
  score?: [number, number]
  winnerId?: TeamId | null
}

const PASSCODES: Record<string, string> = {
  conway: 'conway',
  larooch: 'larooch',
}

const ROUND_ORDER = ['round32', 'round16', 'quarterfinal', 'semifinal', 'final'] as const
const GROUP_ADVANCER_POINTS = 2
const GROUP_PLACEMENT_POINTS = [3, 2, 1, 0] as const
const ROUND_POSITION = {
  round32: { column: 1, offset: 1, spacing: 4 },
  round16: { column: 2, offset: 3, spacing: 8 },
  quarterfinal: { column: 3, offset: 7, spacing: 16 },
  semifinal: { column: 4, offset: 15, spacing: 32 },
  final: { column: 5, offset: 31, spacing: 64 },
} as const

const KNOCKOUT_TIMES: Record<string, string> = {
  M73: '8:00 PM ET',
  M74: '6:00 PM ET',
  M75: '9:00 PM ET',
  M76: '8:00 PM ET',
  M77: '7:00 PM ET',
  M78: '9:00 PM ET',
  M79: '8:00 PM ET',
  M80: '8:00 PM ET',
  M81: '7:00 PM ET',
  M82: '10:00 PM ET',
  M83: '8:00 PM ET',
  M84: '10:00 PM ET',
  M85: '9:00 PM ET',
  M86: '8:00 PM ET',
  M87: '7:00 PM ET',
  M88: '10:00 PM ET',
  M89: '8:00 PM ET',
  M90: '6:00 PM ET',
  M91: '5:00 PM ET',
  M92: '9:00 PM ET',
  M93: '8:00 PM ET',
  M94: '9:00 PM ET',
  M95: '7:00 PM ET',
  M96: '10:00 PM ET',
  M97: '8:00 PM ET',
  M98: '8:00 PM ET',
  M99: '6:00 PM ET',
  M100: '9:00 PM ET',
  M101: '8:00 PM ET',
  M102: '8:00 PM ET',
  M104: '3:00 PM ET',
}

const OPENING_FIXTURES = [
  { id: 'G-A1', date: 'Jun 11', time: '8:00 PM ET', venue: 'Mexico City', teams: ['mexico', 'south-africa'] as [TeamId, TeamId] },
  { id: 'G-B1', date: 'Jun 12', time: '8:00 PM ET', venue: 'Toronto', teams: ['canada', 'bosnia-herzegovina'] as [TeamId, TeamId] },
  { id: 'G-D1', date: 'Jun 12', time: '9:00 PM ET', venue: 'Los Angeles', teams: ['united-states', 'paraguay'] as [TeamId, TeamId] },
  { id: 'G-C1', date: 'Jun 13', time: '6:00 PM ET', venue: 'Miami', teams: ['brazil', 'morocco'] as [TeamId, TeamId] },
]

const GROUP_FIXTURE_PAIRINGS = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
] as const

const GROUP_STAGE_TIMES = ['12:00 PM ET', '3:00 PM ET', '6:00 PM ET', '9:00 PM ET'] as const
const GROUP_STAGE_VENUES = [
  'Mexico City',
  'Toronto',
  'Los Angeles',
  'Miami',
  'Boston',
  'Dallas',
  'Seattle',
  'Vancouver',
  'Houston',
  'Atlanta',
  'Kansas City',
  'New York/New Jersey',
] as const

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
  const [resultsMode, setResultsMode] = useState<ResultsMode>('pre')
  const [dataError, setDataError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeRoom = selectedRoomSlug ? roomBySlug[selectedRoomSlug] : null
  const liveSubmissions = hasSupabaseConfig ? remoteSubmissions : localSubmissions
  const actualResults = resultsMode === 'demo' ? demoActualResults : remoteActualResults ?? emptyActualResults
  const submissions = useMemo(() => [...sampleSubmissions, ...liveSubmissions], [liveSubmissions])
  const visibleSubmissions = selectedRoomSlug
    ? submissions.filter((submission) => submission.roomSlug === selectedRoomSlug)
    : []
  const leaderboard = buildLeaderboard(visibleSubmissions, actualResults)
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
        const [nextSubmissions, nextResults] = await Promise.all([
          fetchRemoteSubmissions(selectedRoomSlug),
          fetchRemoteActualResults(),
        ])

        if (cancelled) return
        setRemoteSubmissions(nextSubmissions)
        setRemoteActualResults(nextResults)
        setDataError('')
      } catch (error) {
        if (!cancelled) setDataError(errorMessage(error))
      }
    }

    void refreshRemoteData()
    const unsubscribe = subscribeToRemotePoolUpdates(() => {
      void refreshRemoteData()
    })

    return () => {
      cancelled = true
      unsubscribe()
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
    const room = roomBySlug[roomSlug]
    const storedSession = loadStoredRoomSession(roomSlug)

    setSelectedRoomSlug(roomSlug)
    setRoomPasscode(enteredPasscode)
    setPreviewSubmission(null)
    setDataError('')

    if (storedSession) {
      void loadExistingBracket(storedSession)
      return
    }

    setRoomSession(null)
    setPicks(createInitialPicks())
    setStep(room.authMode === 'email_otp' ? 'email' : 'name')
  }

  const loadExistingBracket = async (session: RoomSession) => {
    try {
      const roomSubmissions = await loadSubmissionsForRoom(session.roomSlug)
      const existing = findSubmissionForSession(roomSubmissions, session.roomSlug, session)

      saveStoredRoomSession(session)
      setRoomSession(session)
      setPicks(
        existing
          ? {
              groupOrder: existing.groupOrder,
              thirdPlaceAdvancers: existing.thirdPlaceAdvancers,
              knockoutWinners: existing.knockoutWinners,
            }
          : createInitialPicks(),
      )
      setDataError('')
      setStep(existing ? 'build' : 'rulesIntro')
    } catch (error) {
      setDataError(errorMessage(error))
      setRoomSession(null)
      setPicks(createInitialPicks())
      setStep(roomBySlug[session.roomSlug].authMode === 'email_otp' ? 'email' : 'name')
    }
  }

  const submitBracket = async () => {
    if (!roomSession || !selectedRoomSlug || !activeRoom || !bracketReady || submitting) return

    const existing = findSubmissionForSession(liveSubmissions, selectedRoomSlug, roomSession)
    if (existing) {
      setPicks({
        groupOrder: existing.groupOrder,
        thirdPlaceAdvancers: existing.thirdPlaceAdvancers,
        knockoutWinners: existing.knockoutWinners,
      })
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
      saveStoredRoomSession(roomSession)
      setStep('leaderboard')
    } catch (error) {
      setDataError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'gate') {
    return <GateScreen onEnter={beginRoom} />
  }

  if (!activeRoom || !selectedRoomSlug) {
    return <GateScreen onEnter={beginRoom} />
  }

  if (step === 'name') {
    return <NameScreen error={dataError} room={activeRoom} onBack={() => setStep('gate')} onReady={loadExistingBracket} />
  }

  if (step === 'email') {
    return <EmailScreen error={dataError} room={activeRoom} onBack={() => setStep('gate')} onReady={loadExistingBracket} />
  }

  if (step === 'rulesIntro') {
    return <RulesIntroScreen room={activeRoom} onBack={() => setStep(activeRoom.authMode === 'email_otp' ? 'email' : 'name')} onStart={() => setStep('build')} />
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeRoom={activeRoom}
        resultsMode={resultsMode}
        roomSession={roomSession}
        step={step}
        onNavigate={setStep}
        onReset={() => setStep('gate')}
        onResultsModeChange={setResultsMode}
        showBoard={Boolean(currentSubmission)}
      />

      {step === 'build' && (
        <BuildScreen
          actualResults={actualResults}
          bracketReady={bracketReady}
          champion={champion}
          filledGroupSlots={filledGroupSlots}
          groupStageComplete={groupStageComplete}
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
          entries={leaderboard}
          previewSubmission={previewSubmission}
          resultsMode={resultsMode}
          room={activeRoom}
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
        <div className="gate-mark">26</div>
        <label htmlFor="passcode">Pass code</label>
        <input
          autoFocus
          id="passcode"
          onChange={(event) => setPasscode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          placeholder="••••••••"
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
  room,
  onBack,
  onReady,
}: {
  error: string
  room: Room
  onBack: () => void
  onReady: (session: RoomSession) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <p className="kicker">{room.name}</p>
        <h1>Pick your name.</h1>
        <div className="dark-input-row">
          <User size={17} />
          <input
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) {
                void onReady({ roomSlug: room.slug, ownerName: name.trim() })
              }
            }}
            placeholder="Name"
            value={name}
          />
        </div>
        <div className="onboarding-actions">
          <button className="ghost-button" onClick={onBack} type="button">
            Back
          </button>
          <button
            className="solid-button"
            onClick={() => {
              if (!name.trim()) {
                setFormError('Name required.')
                return
              }
              void onReady({ roomSlug: room.slug, ownerName: name.trim() })
            }}
            type="button"
          >
            Continue
          </button>
        </div>
        {(formError || error) && <p className="form-error">{formError || error}</p>}
      </section>
    </main>
  )
}

function EmailScreen({
  error,
  room,
  onBack,
  onReady,
}: {
  error: string
  room: Room
  onBack: () => void
  onReady: (session: RoomSession) => void | Promise<void>
}) {
  const expectedDomain = room.emailDomain ?? 'conway.ai'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    const normalized = email.trim().toLowerCase()
    if (!normalized.endsWith(`@${expectedDomain}`)) {
      setFormError(`Use an @${expectedDomain} address.`)
      return
    }

    setBusy(true)
    setFormError('')

    try {
      if (hasSupabaseConfig) {
        await sendRemoteEmailCode(normalized)
      }
      setSent(true)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    const normalized = email.trim().toLowerCase()
    if (code.trim().length < 4) {
      setFormError('Enter the email code.')
      return
    }

    setBusy(true)
    setFormError('')

    try {
      const verified = hasSupabaseConfig
        ? await verifyRemoteEmailCode(normalized, code.trim())
        : {
            ownerEmail: normalized,
            ownerName: formatEmailName(normalized),
          }

      await onReady({
        roomSlug: room.slug,
        ownerEmail: verified.ownerEmail,
        ownerName: verified.ownerName,
      })
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <p className="kicker">{room.name}</p>
        <h1>Verify email.</h1>
        <div className="dark-input-row">
          <Mail size={17} />
          <input
            autoFocus
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void sendCode()
            }}
            placeholder={`name@${expectedDomain}`}
            type="email"
            value={email}
          />
        </div>
        {sent && (
          <div className="dark-input-row">
            <ShieldCheck size={17} />
            <input
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void verify()
              }}
              placeholder="Email code"
              value={code}
            />
          </div>
        )}
        <div className="onboarding-actions">
          <button className="ghost-button" onClick={onBack} type="button">
            Back
          </button>
          <button className="solid-button" disabled={busy} onClick={() => void (sent ? verify() : sendCode())} type="button">
            {busy ? 'Working...' : sent ? 'Verify' : 'Send code'}
          </button>
        </div>
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
  resultsMode,
  roomSession,
  step,
  onNavigate,
  onResultsModeChange,
  onReset,
  showBoard,
}: {
  activeRoom: Room
  resultsMode: ResultsMode
  roomSession: RoomSession | null
  step: AppStep
  onNavigate: (step: AppStep) => void
  onResultsModeChange: (mode: ResultsMode) => void
  onReset: () => void
  showBoard: boolean
}) {
  return (
    <header className="app-header">
      <button className="wordmark" onClick={onReset} type="button">
        <span>26</span>
        <strong>{activeRoom.name}</strong>
      </button>
      <div className="header-meta">
        <span>{roomSession?.ownerName}</span>
        <span>
          <Lock size={13} />
          Jun 11
        </span>
      </div>
      <ResultsModeControl mode={resultsMode} onChange={onResultsModeChange} />
      <nav className="dark-tabs" aria-label="Primary">
        <button className={step === 'build' ? 'active' : ''} onClick={() => onNavigate('build')} type="button">
          {showBoard ? <FileCheck2 size={16} /> : <PencilLine size={16} />}
          {showBoard ? 'My Submission' : 'Build'}
        </button>
        {showBoard && (
          <button
            className={step === 'leaderboard' ? 'active' : ''}
            onClick={() => onNavigate('leaderboard')}
            type="button"
          >
            <Table2 size={16} />
            Leaderboard
          </button>
        )}
      </nav>
    </header>
  )
}

function ResultsModeControl({ mode, onChange }: { mode: ResultsMode; onChange: (mode: ResultsMode) => void }) {
  return (
    <div className="results-mode-control" aria-label="Results preview mode">
      <button className={mode === 'pre' ? 'active' : ''} onClick={() => onChange('pre')} type="button">
        Pre
      </button>
      <button className={mode === 'demo' ? 'active' : ''} onClick={() => onChange('demo')} type="button">
        Demo live
      </button>
    </div>
  )
}

function BuildScreen({
  actualResults,
  bracketReady,
  champion,
  filledGroupSlots,
  groupStageComplete,
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
  picks: BracketPicks
  readOnly: boolean
  setPicks: Dispatch<SetStateAction<BracketPicks>>
  submitError: string
  submitting: boolean
  onClear: () => void
  onSubmit: () => void | Promise<void>
}) {
  const mapStages = useMemo(() => getPredictionTeamMapStages(picks), [picks])

  if (readOnly) {
    return <SubmittedBuildScreen actualResults={actualResults} champion={champion} filledGroupSlots={filledGroupSlots} picks={picks} />
  }

  return (
    <div className="build-shell">
      <aside className="build-rail">
        <section className="panel">
          <p className="kicker">Progress</p>
          <div className="progress-stack">
            <ProgressRow label="Groups" value={`${filledGroupSlots}/48`} complete={groupStageComplete} />
            <ProgressRow label="Thirds" value={`${picks.thirdPlaceAdvancers.length}/8`} complete={picks.thirdPlaceAdvancers.length === 8} />
            <ProgressRow label="Champion" value={champion ? teamsById[champion].code : '-'} complete={Boolean(champion)} />
          </div>
        </section>
        <section className="panel">
          <p className="kicker">{readOnly ? 'Submitted' : 'Submit'}</p>
          <h2>{champion ? teamsById[champion].name : 'No champion'}</h2>
          {readOnly ? (
            <div className="frozen-badge">
              <Lock size={15} />
              Frozen
            </div>
          ) : (
            <>
              <button className="solid-button full" disabled={!bracketReady || submitting} onClick={() => void onSubmit()} type="button">
                <Save size={16} />
                {submitting ? 'Submitting...' : 'Submit picks'}
              </button>
              <button className="ghost-button full" onClick={onClear} type="button">
                Clear picks
              </button>
              {submitError && <p className="form-error">{submitError}</p>}
            </>
          )}
        </section>
        <section className="panel data-panel">
          <span>Database</span>
          <strong>{hasSupabaseConfig ? 'Supabase' : 'Local mock'}</strong>
        </section>
      </aside>

      <div className="build-main">
        <WorldCupMap compact kicker="Map" stages={mapStages} title="Your predictions" />
        <GroupStageBuilder picks={picks} readOnly={readOnly} setPicks={setPicks} />
        <ThirdPlaceSelector groupStageComplete={groupStageComplete} picks={picks} readOnly={readOnly} setPicks={setPicks} />
        <KnockoutBuilder picks={picks} readOnly={readOnly} setPicks={setPicks} />
      </div>
    </div>
  )
}

function SubmittedBuildScreen({
  actualResults,
  champion,
  filledGroupSlots,
  picks,
}: {
  actualResults: ActualResults
  champion: TeamId | null
  filledGroupSlots: number
  picks: BracketPicks
}) {
  const mapStages = useMemo(() => getPredictionTeamMapStages(picks), [picks])

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
            <ProgressRow label="Champion" value={champion ? teamsById[champion].code : '-'} complete={Boolean(champion)} />
          </div>
        </section>
      </aside>

      <div className="review-main">
        <WorldCupMap compact kicker="Map" stages={mapStages} title="Your predictions" />
        <ReviewGroups actualResults={actualResults} picks={picks} />
        <ReviewBracket actualResults={actualResults} picks={picks} />
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
  mode = 'submission',
  picks,
}: {
  actualResults?: ActualResults
  mode?: 'submission' | 'official'
  picks: BracketPicks
}) {
  const matches = buildResolvedBracket(picks)

  return (
    <section className="section-block review-section">
      <SectionHead kicker="02" title="Knockout" />
      <div className="review-bracket-grid">
        {ROUND_ORDER.map((round) => (
          matches
            .filter((match) => match.round === round)
            .map((match, index) => {
              const meta = ROUND_POSITION[round]
              const actualWinner = actualResults.knockoutWinners[match.id]

              return (
                <article
                  className="review-match"
                  key={match.id}
                  style={{
                    gridColumn: meta.column,
                    gridRow: `${meta.offset + index * meta.spacing} / span 4`,
                  }}
                >
                  <span className="review-match-meta">
                    <span>{match.id}</span>
                    {actualWinner && <strong>{teamsById[actualWinner]?.code}</strong>}
                  </span>
                  {match.teams.map((teamId, slotIndex) => {
                    const selected = Boolean(teamId && match.selectedWinner === teamId)
                    const result = mode === 'submission' ? getKnockoutPickResult(teamId, match.selectedWinner, match.points, actualWinner) : null
                    const resultClass = result ? ` result-${result.status}` : ''
                    const pointValue = result && 'points' in result ? result.points ?? 0 : 0

                    return (
                      <div className={`review-pick${selected ? ' selected' : ''}${resultClass ? ` ${resultClass}` : ''}`} key={`${match.id}-${slotIndex}`}>
                        {teamId ? <TeamIdentity compact teamId={teamId} /> : <small>{match.slots[slotIndex].label}</small>}
                        {result && (
                          <span className={result.status === 'wrong' ? 'review-result-pill wrong' : 'review-result-pill correct'}>
                            {result.status === 'wrong' ? <X size={12} /> : <Check size={12} />}
                            <small>{result.label}</small>
                            {pointValue > 0 && <b className="point-chip">+{pointValue}</b>}
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
    </section>
  )
}

function getKnockoutPickResult(teamId: TeamId | null, selectedWinner: TeamId | null, points: number, actualWinner?: TeamId) {
  if (!teamId || !actualWinner || !selectedWinner) return null
  if (selectedWinner === teamId && actualWinner === teamId) return { status: 'correct', label: 'Pick', points }
  if (selectedWinner === teamId && actualWinner !== teamId) return { status: 'wrong', label: 'Pick' }
  if (actualWinner === teamId) return { status: 'actual', label: 'Actual' }
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
        description="Rank each group 1-4. The top two teams in every group automatically move into the Round of 32."
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
  const placed = picks.groupOrder[group]
  const availableTeams = teamsByGroup[group].filter((team) => !placed.includes(team.id))

  const readDraggedTeam = (event: DragEvent) => event.dataTransfer.getData('text/plain') as TeamId
  const placeSelectedTeam = (index: number) => {
    if (readOnly || !selectedTeamId) return
    setPicks((current) => placeTeamInGroup(current, group, selectedTeamId, index))
    setSelectedTeamId(null)
  }

  return (
    <article className="group-card">
      <header>
        <span>Group {group}</span>
        <small>{placed.filter(Boolean).length}/4</small>
      </header>

      <div
        className="team-pool"
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
            group={group}
            key={team.id}
            onSelect={() => setSelectedTeamId(team.id)}
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
              key={index}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (readOnly) return
                const draggedTeamId = readDraggedTeam(event)
                setPicks((current) => placeTeamInGroup(current, group, draggedTeamId, index))
                setSelectedTeamId(null)
              }}
              onClick={() => placeSelectedTeam(index)}
            >
              <span className="slot-number">{index + 1}</span>
              {teamId ? (
                <TeamToken
                  group={group}
                  onSelect={() => setSelectedTeamId(teamId)}
                  readOnly={readOnly}
                  selected={selectedTeamId === teamId}
                  teamId={teamId}
                />
              ) : (
                <span className="slot-empty">Drop team</span>
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
  readOnly,
  selected,
  teamId,
}: {
  group: GroupId
  onSelect: () => void
  readOnly: boolean
  selected: boolean
  teamId: TeamId
}) {
  const team = teamsById[teamId]

  return (
    <div
      aria-label={team.name}
      className={`${readOnly ? 'team-token readonly' : 'team-token'}${selected ? ' selected' : ''}`}
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
        {ROUND_ORDER.map((round) => {
          const roundMatches = matches.filter((match) => match.round === round)
          const meta = ROUND_POSITION[round]

          return roundMatches.map((match, index) => (
            <article
              className={round === 'final' ? 'classic-match final' : 'classic-match'}
              key={match.id}
              style={{
                gridColumn: meta.column,
                gridRow: `${meta.offset + index * meta.spacing} / span 4`,
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
          ))
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

function formatResultDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(isoDate))
}

function scheduleTeam(teamId: TeamId | null, fallbackLabel: string): ScheduleTeam {
  return {
    teamId,
    label: teamId ? teamsById[teamId]?.shortName ?? fallbackLabel : fallbackLabel,
  }
}

function getGroupFixtureDate(fixtureIndex: number) {
  const day = 11 + Math.floor(fixtureIndex / GROUP_STAGE_TIMES.length)
  return `Jun ${day}`
}

function getMockScore(fixtureId: string, teams: [ScheduleTeam, ScheduleTeam], winnerId: TeamId | null) {
  if (!winnerId || !teams[0].teamId || !teams[1].teamId) return undefined

  const seed = [...fixtureId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const winningGoals = [1, 2, 2, 3, 3][seed % 5]
  const losingGoals = [0, 0, 1, 1, 2][seed % 5]

  return teams[0].teamId === winnerId
    ? [winningGoals, losingGoals] as [number, number]
    : [losingGoals, winningGoals] as [number, number]
}

function buildGroupSchedule(actualResults: ActualResults): ScheduleFixture[] {
  const openingFixtureById = new Map(OPENING_FIXTURES.map((fixture) => [fixture.id, fixture]))

  return GROUP_IDS.flatMap((group, groupIndex) => {
    const actualOrder = actualResults.groupOrder[group] ?? []
    const groupComplete = actualOrder.length >= 4

    return GROUP_FIXTURE_PAIRINGS.map(([leftIndex, rightIndex], pairingIndex) => {
      const globalIndex = groupIndex * GROUP_FIXTURE_PAIRINGS.length + pairingIndex
      const id = `G-${group}${pairingIndex + 1}`
      const override = openingFixtureById.get(id)
      const leftTeamId = override?.teams[0] ?? teamsByGroup[group][leftIndex].id
      const rightTeamId = override?.teams[1] ?? teamsByGroup[group][rightIndex].id
      const teams = [scheduleTeam(leftTeamId, `Group ${group}`), scheduleTeam(rightTeamId, `Group ${group}`)] as [ScheduleTeam, ScheduleTeam]
      const leftActualIndex = actualOrder.indexOf(leftTeamId)
      const rightActualIndex = actualOrder.indexOf(rightTeamId)
      const winnerId = groupComplete
        ? leftActualIndex <= rightActualIndex
          ? leftTeamId
          : rightTeamId
        : null

      return {
        id,
        date: override?.date ?? getGroupFixtureDate(globalIndex),
        time: override?.time ?? GROUP_STAGE_TIMES[globalIndex % GROUP_STAGE_TIMES.length],
        venue: override?.venue ?? GROUP_STAGE_VENUES[globalIndex % GROUP_STAGE_VENUES.length],
        teams,
        label: `Group ${group}`,
        status: groupComplete ? 'completed' : 'upcoming',
        score: getMockScore(id, teams, winnerId),
        winnerId,
      }
    })
  })
}

function buildLiveSchedule(actualResults: ActualResults): ScheduleFixture[] {
  const actualPicks = buildActualPicks(actualResults)
  const groupSchedule = buildGroupSchedule(actualResults)
  const bracketSchedule = buildResolvedBracket(actualPicks).map((match) => {
    const teams = [
      scheduleTeam(match.teams[0], match.slots[0].label),
      scheduleTeam(match.teams[1], match.slots[1].label),
    ] as [ScheduleTeam, ScheduleTeam]
    const winnerId = actualResults.knockoutWinners[match.id] ?? null

    return {
      id: match.id,
      date: match.date,
      time: KNOCKOUT_TIMES[match.id] ?? 'TBD',
      venue: match.venue,
      teams,
      label: match.label,
      status: winnerId ? 'completed' : 'upcoming',
      score: getMockScore(match.id, teams, winnerId),
      winnerId,
    } satisfies ScheduleFixture
  })

  return [...groupSchedule, ...bracketSchedule]
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

function OfficialResultsPanel({ actualResults }: { actualResults: ActualResults }) {
  const actualPicks = useMemo(() => buildActualPicks(actualResults), [actualResults])
  const hasResults = hasActualResults(actualResults)

  return (
    <section className="official-results-panel">
      <div className="official-results-head">
        <div>
          <p className="kicker">Official results</p>
          <strong>{hasResults ? `Updated ${formatResultDate(actualResults.updatedAt)}` : 'Waiting for Matchday 1'}</strong>
        </div>
        <span>{actualResults.source}</span>
      </div>

      {!hasResults ? (
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

function LiveSchedulePanel({ actualResults }: { actualResults: ActualResults }) {
  const fixtures = useMemo(() => buildLiveSchedule(actualResults), [actualResults])
  const listRef = useRef<HTMLDivElement | null>(null)
  const completedCount = fixtures.filter((fixture) => fixture.status === 'completed').length

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const firstUpcoming = list.querySelector<HTMLElement>('.schedule-row.upcoming')
    const target = firstUpcoming ?? list.lastElementChild
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
          const statusLabel = fixture.status === 'completed' ? 'Completed' : 'Upcoming'

          return (
            <Fragment key={fixture.id}>
              {showStatusDivider && (
                <div className={`schedule-section-label ${fixture.status}`}>
                  <span>{statusLabel}</span>
                  <b>{fixture.status === 'completed' ? `${completedCount} final` : `${fixtures.length - completedCount} to play`}</b>
                </div>
              )}
              <article className={`schedule-row ${fixture.status}`}>
                <div className="schedule-meta">
                  <span>{fixture.date}</span>
                  <span className="schedule-time">{fixture.status === 'completed' ? 'FT' : fixture.time}</span>
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
  entries,
  room,
  previewSubmission,
  resultsMode,
  onPreview,
}: {
  actualResults: ActualResults
  entries: ReturnType<typeof buildLeaderboard>
  room: Room
  previewSubmission: BracketSubmission | null
  resultsMode: ResultsMode
  onPreview: (submission: BracketSubmission | null) => void
}) {
  const selectedSubmission = previewSubmission
  const actualMapStages = useMemo(() => getActualTeamMapStages(actualResults), [actualResults])

  return (
    <div className={selectedSubmission ? 'leaderboard-shell with-detail' : 'leaderboard-shell'}>
      <section className="leaderboard-main">
        <div className="board-topline">
          <span>{room.name}</span>
          <div className="board-title-row">
            <RulesInfoHover />
            <strong>Leaderboard</strong>
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
              <span>Score</span>
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
                    <small>{entry.submission.source === 'local' ? 'Your picks' : 'Demo picks'}</small>
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
            note={resultsMode === 'demo' ? 'Demo results preview' : 'Results will fill in here'}
            stages={actualMapStages}
            title="Results"
          />
          <OfficialResultsPanel actualResults={actualResults} />
        </div>
      </section>

      {selectedSubmission ? (
        <aside className="detail-rail">
          <BracketSummary actualResults={actualResults} onClose={() => onPreview(null)} submission={selectedSubmission} />
          <div className="detail-review-stack">
            <ReviewBracket actualResults={actualResults} picks={selectedSubmission} />
            <ReviewGroups actualResults={actualResults} picks={selectedSubmission} />
          </div>
        </aside>
      ) : (
        <LiveSchedulePanel actualResults={actualResults} />
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
  submission,
  onClose,
}: {
  actualResults: ActualResults
  submission: BracketSubmission
  onClose: () => void
}) {
  const champion = getChampion(submission)
  const score = scoreSubmission(submission, actualResults)
  const groupWinners = getGroupWinners(submission)

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
      <div className="winner-cloud">
        {groupWinners.map((teamId) => (
          <span key={teamId}>{teamsById[teamId].code}</span>
        ))}
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
