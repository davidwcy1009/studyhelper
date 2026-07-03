import { useEffect, useState } from 'react'
import type { Subject } from './types'
import { Dashboard } from './views/Dashboard'
import { SubjectView } from './views/SubjectView'
import { NoteView } from './views/NoteView'
import { DeckView } from './views/DeckView'
import { StudySession } from './views/StudySession'
import { QuizPlayer } from './views/QuizPlayer'
import { PracticeView } from './views/PracticeView'
import { SearchView } from './views/SearchView'
import { Settings } from './views/Settings'

/** Navigate to a hash route, e.g. go('/deck/abc'). */
export function go(path: string) {
  location.hash = `#${path}`
}

/** Names for the 8 categorical colour slots (used by the picker). */
export const SUBJECT_COLORS = ['blue', 'aqua', 'yellow', 'green', 'violet', 'red', 'magenta', 'orange']

export function SubjectChip({ subject, big }: { subject: Subject; big?: boolean }) {
  return (
    <span
      className={`subject-chip ${big ? 'big' : ''}`}
      style={{ background: `var(--cat-${subject.color % 8})` }}
      aria-hidden
    />
  )
}

type Route =
  | { view: 'dashboard' }
  | { view: 'subject'; id: string }
  | { view: 'note'; id: string }
  | { view: 'deck'; id: string }
  | { view: 'study'; id: string; mode: 'study' | 'practice' }
  | { view: 'quiz'; id: string }
  | { view: 'practice'; id: string }
  | { view: 'search' }
  | { view: 'settings' }

function parseRoute(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  switch (parts[0]) {
    case 'subject':
      return parts[1] ? { view: 'subject', id: parts[1] } : { view: 'dashboard' }
    case 'note':
      return parts[1] ? { view: 'note', id: parts[1] } : { view: 'dashboard' }
    case 'deck':
      return parts[1] ? { view: 'deck', id: parts[1] } : { view: 'dashboard' }
    case 'study':
      return parts[1]
        ? {
            view: 'study',
            id: parts[1],
            mode: new URLSearchParams(query).get('mode') === 'practice' ? 'practice' : 'study',
          }
        : { view: 'dashboard' }
    case 'quiz':
      return parts[1] ? { view: 'quiz', id: parts[1] } : { view: 'dashboard' }
    case 'practice':
      return parts[1] ? { view: 'practice', id: parts[1] } : { view: 'dashboard' }
    case 'search':
      return { view: 'search' }
    case 'settings':
      return { view: 'settings' }
    default:
      return { view: 'dashboard' }
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  const immersive = route.view === 'study'

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        go('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      {!immersive && (
        <header className="topbar">
          <a className="brand" href="#/">
            <span className="brand-mark">📖</span> Study Helper
          </a>
          <nav>
            <a href="#/" className={route.view === 'dashboard' ? 'active' : ''}>
              Home
            </a>
            <a
              href="#/search"
              className={route.view === 'search' ? 'active' : ''}
              aria-label="Search"
            >
              🔍 Search
            </a>
            <a href="#/settings" className={route.view === 'settings' ? 'active' : ''}>
              Settings
            </a>
          </nav>
        </header>
      )}
      <main>
        {route.view === 'dashboard' && <Dashboard />}
        {route.view === 'subject' && <SubjectView subjectId={route.id} />}
        {route.view === 'note' && <NoteView noteId={route.id} />}
        {route.view === 'deck' && <DeckView deckId={route.id} />}
        {route.view === 'study' && (
          <StudySession key={route.id + route.mode} deckId={route.id} mode={route.mode} />
        )}
        {route.view === 'quiz' && <QuizPlayer quizId={route.id} />}
        {route.view === 'practice' && <PracticeView practiceId={route.id} />}
        {route.view === 'search' && <SearchView />}
        {route.view === 'settings' && <Settings />}
      </main>
    </div>
  )
}
