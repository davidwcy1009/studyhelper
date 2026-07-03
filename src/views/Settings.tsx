import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { exportBackup, downloadBackup, importBackup } from '../backup'
import {
  aiErrorMessage,
  getApiKey,
  getModel,
  hasApiKey,
  MODEL_CHOICES,
  setApiKey,
  setModel,
  testApiKey,
} from '../ai'

export function Settings() {
  const [key, setKey] = useState(getApiKey())
  const [model, setModelState] = useState(getModel())
  const [keyStatus, setKeyStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = useLiveQuery(async () => ({
    subjects: await db.subjects.count(),
    notes: await db.notes.count(),
    cards: await db.cards.count(),
    quizzes: await db.quizzes.count(),
  }))

  const saveKey = () => {
    setApiKey(key)
    setKeyStatus(key.trim() ? 'Key saved on this device.' : 'Key removed.')
  }

  const test = async () => {
    setBusy(true)
    setKeyStatus('Testing…')
    try {
      setApiKey(key)
      await testApiKey()
      setKeyStatus('✅ Key works!')
    } catch (e) {
      setKeyStatus(`❌ ${aiErrorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    downloadBackup(await exportBackup())
  }

  const doImport = async (file: File) => {
    if (
      !confirm(
        'Importing replaces EVERYTHING currently in the app with the backup. Continue?',
      )
    )
      return
    try {
      await importBackup(file)
      setImportMsg('✅ Backup restored.')
    } catch (e) {
      setImportMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const eraseAll = async () => {
    if (!confirm('Erase ALL data on this device? Export a backup first if unsure.')) return
    if (!confirm('Really erase everything? This cannot be undone.')) return
    await db.delete()
    location.reload()
  }

  return (
    <div className="page">
      <div className="crumbs">
        <a href="#/">‹ Home</a>
      </div>
      <h1>Settings</h1>

      <section className="panel">
        <h2>Claude (AI features)</h2>
        <p className="hint">
          Powers “Flashcards from note”, quizzes and explanations. The key is stored only on this
          device. Get one at{' '}
          <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
            console.anthropic.com
          </a>{' '}
          — setting a monthly spend limit there is a good idea.
        </p>
        <label>
          API key
          <input
            type="password"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" onClick={saveKey}>
            Save key
          </button>
          <button className="btn btn-sm" disabled={busy || !key.trim()} onClick={test}>
            Test key
          </button>
          {hasApiKey() && (
            <button
              className="btn btn-sm btn-danger-ghost"
              onClick={() => {
                setApiKey('')
                setKey('')
                setKeyStatus('Key removed.')
              }}
            >
              Remove key
            </button>
          )}
        </div>
        {keyStatus && <p className="hint">{keyStatus}</p>}

        <label>
          Model
          <select
            value={model}
            onChange={(e) => {
              setModelState(e.target.value)
              setModel(e.target.value)
            }}
          >
            {MODEL_CHOICES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.hint}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h2>Backup & moving between devices</h2>
        <p className="hint">
          Everything lives on this device. To move notes and cards to another device (e.g. iPad ↔
          MacBook): export here, share the file via AirDrop or iCloud Drive, then import on the
          other device.
        </p>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" onClick={doExport}>
            Export backup
          </button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            Import backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
        {importMsg && <p className="hint">{importMsg}</p>}
        {counts && (
          <p className="hint">
            Currently: {counts.subjects} subjects · {counts.notes} notes · {counts.cards} cards ·{' '}
            {counts.quizzes} quizzes
          </p>
        )}
      </section>

      <section className="panel danger">
        <h2>Danger zone</h2>
        <button className="btn btn-sm btn-danger" onClick={eraseAll}>
          Erase all data on this device
        </button>
      </section>

      <p className="hint center">
        Study Helper · your data never leaves this device (except AI requests to Claude)
      </p>
    </div>
  )
}
