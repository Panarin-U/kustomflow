import { useState, useEffect } from 'react'
import './App.css'

function Alert({ alert }) {
  if (!alert) return null
  return (
    <div className={`alert alert-${alert.type}`}>
      <span className="alert-icon">
        {alert.type === 'success' && '✓'}
        {alert.type === 'warning' && '⚠'}
        {alert.type === 'error' && '✕'}
      </span>
      {alert.message}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button type="button" className="copy-btn" onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  )
}

const PROTOCOL_URLS = {
  ssh: (name) => `ssh://git@gitdev.devops.krungthai.com:2222/cicd/kustomize/next/${name}.git`,
  http: (name) => `https://gitdev.devops.krungthai.com/cicd/kustomize/next/${name}.git`,
}

function ClonePage() {
  const [repoName, setRepoName] = useState('')
  const [protocol, setProtocol] = useState('ssh')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)

  async function handleClone(e) {
    e.preventDefault()
    if (!repoName.trim()) return
    setLoading(true)
    setAlert(null)
    try {
      const res = await fetch('http://localhost:3001/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: repoName.trim(), protocol }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAlert({ type: 'error', message: data.error })
      } else if (data.status === 'already_exists') {
        setAlert({ type: 'warning', message: data.message })
      } else {
        setAlert({ type: 'success', message: data.message })
        setRepoName('')
      }
    } catch {
      setAlert({ type: 'error', message: 'Cannot connect to server' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-content">
      <p className="page-desc">Clone a kustomize repo into <code>/git-repo</code></p>
      <form onSubmit={handleClone} className="form">
        <label className="label">Protocol</label>
        <div className="protocol-toggle">
          {['ssh', 'http'].map((p) => (
            <button
              key={p}
              type="button"
              className={`protocol-btn ${protocol === p ? 'protocol-btn-active' : ''}`}
              onClick={() => setProtocol(p)}
              disabled={loading}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        <label className="label">Repository Name</label>
        <input
          className="input"
          type="text"
          placeholder="e.g. orchestrator-otp-validation"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          disabled={loading}
        />
        <p className="hint">{PROTOCOL_URLS[protocol](repoName || '<repo-name>')}</p>

        <button className="btn" type="submit" disabled={loading || !repoName.trim()}>
          {loading ? 'Cloning...' : 'Clone Repository'}
        </button>
      </form>
      <Alert alert={alert} />
    </div>
  )
}

function ConfigPreview({ repoName, env, onClose }) {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState('')
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveAlert, setSaveAlert] = useState(null)

  useEffect(() => {
    fetch(`http://localhost:3001/api/config?repoName=${encodeURIComponent(repoName)}&env=${encodeURIComponent(env)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setData({ error: d.error })
        } else {
          setData(d)
          setConfig(d.config ?? '')
          setSecret(d.secret ?? '')
        }
      })
      .catch(() => setData({ error: 'Cannot connect to server' }))
  }, [repoName, env])

  async function handleSave() {
    setSaving(true)
    setSaveAlert(null)
    try {
      const body = {}
      if (data.config !== null) body.config = config
      if (data.secret !== null) body.secret = secret
      const res = await fetch('http://localhost:3001/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, env, ...body }),
      })
      const result = await res.json()
      if (res.ok) {
        setSaveAlert({ type: 'success', message: 'Config saved' })
      } else {
        setSaveAlert({ type: 'error', message: result.error })
      }
    } catch {
      setSaveAlert({ type: 'error', message: 'Cannot connect to server' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="config-preview">
      <div className="config-preview-header">
        <span className="config-preview-title">Config — {repoName} / {env}</span>
        <button type="button" className="btn-remove" onClick={onClose}>✕</button>
      </div>

      {!data ? (
        <p className="hint">Loading...</p>
      ) : data.error ? (
        <p className="hint">{data.error}</p>
      ) : (
        <>
          {data.config !== null && (
            <div className="config-section">
              <label className="config-file-label">configs/config.env</label>
              <textarea
                className="config-textarea"
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
          {data.secret !== null && (
            <div className="config-section">
              <label className="config-file-label">secrets/secret.env</label>
              <textarea
                className="config-textarea config-textarea-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
          <div className="config-actions">
            {saveAlert && (
              <span className={`config-save-msg config-save-msg-${saveAlert.type}`}>{saveAlert.message}</span>
            )}
            <button type="button" className="btn btn-green" style={{ marginTop: 0 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

let nextId = 1

function UpdateTagPage() {
  const [repos, setRepos] = useState([])
  const [env, setEnv] = useState('stg')
  const [mrRelease, setMrRelease] = useState(false)
  const [entries, setEntries] = useState([{ id: nextId++, repoName: '', newTag: '', status: null }])
  const [loading, setLoading] = useState(false)
  const [configOpen, setConfigOpen] = useState({})

  useEffect(() => {
    fetch('http://localhost:3001/api/repos')
      .then((r) => r.json())
      .then((data) => {
        setRepos(data.repos)
        if (data.repos.length > 0) {
          setEntries([{ id: nextId++, repoName: data.repos[0], newTag: '', status: null }])
        }
      })
      .catch(() => {})
  }, [])

  function addEntry() {
    setEntries((prev) => {
      const used = new Set(prev.map((e) => e.repoName))
      const next = repos.find((r) => !used.has(r)) || ''
      return [...prev, { id: nextId++, repoName: next, newTag: '', status: null }]
    })
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function updateEntry(id, field, value) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value, status: null } : e))
  }

  function handleEnvChange(newEnv) {
    setEnv(newEnv)
    setEntries((prev) => prev.map((e) => ({ ...e, status: null })))
    setConfigOpen({})
  }

  function toggleConfig(id) {
    setConfigOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleUpdate(e) {
    e.preventDefault()
    const valid = entries.filter((en) => en.repoName && en.newTag.trim())
    if (valid.length === 0) return

    setLoading(true)
    setEntries((prev) => prev.map((en) => ({ ...en, status: null })))

    await Promise.all(
      valid.map(async (en) => {
        try {
          const res = await fetch('http://localhost:3001/api/update-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName: en.repoName, newTag: en.newTag.trim(), env, mrRelease }),
          })
          const data = await res.json()
          const mrUrl = `https://gitdev.devops.krungthai.com/cicd/kustomize/next/${en.repoName}/-/merge_requests`
          const status = res.ok
            ? { type: 'success', message: data.message, mrUrl }
            : { type: 'error', message: data.error }
          setEntries((prev) => prev.map((x) =>
            x.id === en.id ? { ...x, status, newTag: res.ok ? '' : x.newTag } : x
          ))
        } catch {
          setEntries((prev) => prev.map((x) => x.id === en.id ? { ...x, status: { type: 'error', message: 'Cannot connect to server' } } : x))
        }
      })
    )

    setLoading(false)
  }

  const canSubmit = !loading && repos.length > 0 && entries.some((en) => en.repoName && en.newTag.trim())

  return (
    <div className="page-content">
      <p className="page-desc">Update <code>newTag</code> in <code>overlays/{env}/kustomization.yaml</code> and push to <code>develop</code></p>

      <div className="subtabs">
        {['stg', 'prd'].map((e) => (
          <button
            key={e}
            type="button"
            className={`subtab ${env === e ? `subtab-active subtab-${e}` : ''}`}
            onClick={() => handleEnvChange(e)}
            disabled={loading}
          >
            {e.toUpperCase()}
          </button>
        ))}
      </div>

      {repos.length === 0 ? (
        <p className="hint">No repositories found in /git-repo. Clone one first.</p>
      ) : (
        <form onSubmit={handleUpdate} className="form">
          <div className="entries">
            {entries.map((en, idx) => (
              <div key={en.id} className="entry">
                <div className="entry-header">
                  <span className="entry-label">#{idx + 1}</span>
                  <div className="entry-header-actions">
                    {en.repoName && (
                      <button
                        type="button"
                        className={`btn-config ${configOpen[en.id] ? 'btn-config-active' : ''}`}
                        onClick={() => toggleConfig(en.id)}
                        disabled={loading}
                      >Preview Config</button>
                    )}
                    {entries.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeEntry(en.id)}
                        disabled={loading}
                      >✕</button>
                    )}
                  </div>
                </div>
                <div className="entry-row">
                  <div className="entry-field">
                    <label className="label">Repository</label>
                    <select
                      className="input select"
                      value={en.repoName}
                      onChange={(e) => updateEntry(en.id, 'repoName', e.target.value)}
                      disabled={loading}
                    >
                      {repos
                        .filter((r) => r === en.repoName || !entries.some((x) => x.id !== en.id && x.repoName === r))
                        .map((r) => <option key={r} value={r}>{r}</option>)
                      }
                    </select>
                  </div>
                  <div className="entry-field">
                    <label className="label">New Tag</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="e.g. 2026.4.0"
                      value={en.newTag}
                      onChange={(e) => updateEntry(en.id, 'newTag', e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
                {en.status && (
                  <div className={`alert alert-${en.status.type}`} style={{ marginTop: 8 }}>
                    <span className="alert-icon">
                      {en.status.type === 'success' ? '✓' : '✕'}
                    </span>
                    <span>
                      {en.status.message}
                      {en.status.type === 'success' && en.status.mrUrl && (
                        <>
                          <a
                            href={en.status.mrUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mr-link"
                          >
                            View Merge Requests →
                          </a>
                          <CopyButton text={en.status.mrUrl} />
                        </>
                      )}
                    </span>
                  </div>
                )}
                {configOpen[en.id] && en.repoName && (
                  <ConfigPreview
                    repoName={en.repoName}
                    env={env}
                    onClose={() => toggleConfig(en.id)}
                  />
                )}
              </div>
            ))}
          </div>

          {entries.length < repos.length && (
            <button type="button" className="btn-add" onClick={addEntry} disabled={loading}>
              + Add Repository
            </button>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              className="checkbox"
              checked={mrRelease}
              onChange={(e) => setMrRelease(e.target.checked)}
              disabled={loading}
            />
            <span>Create MR to <code>release</code> branch after push</span>
          </label>

          {mrRelease && entries.some((en) => en.newTag.trim()) && (
            <div className="mr-preview">
              <span className="mr-preview-label">MR flags</span>
              <code>-o merge_request.create -o merge_request.target=release -o merge_request.title="update tag {entries.find((en) => en.newTag.trim())?.newTag || ''}"</code>
            </div>
          )}

          <button className={`btn ${env === 'prd' ? 'btn-orange' : 'btn-green'}`} type="submit" disabled={!canSubmit}>
            {loading ? 'Updating...' : `Update & Push to develop (${entries.filter((en) => en.repoName && en.newTag.trim()).length})`}
          </button>
        </form>
      )}
    </div>
  )
}

const TABS = [
  { id: 'clone', label: 'Clone Repository' },
  { id: 'update-tag', label: 'Update Image Tag' },
]

function App() {
  const [activeTab, setActiveTab] = useState('clone')

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="title">Kustomflow</h1>
        <p className="subtitle">Kustomize image tag manager</p>

        <div className="card">
          <div className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-body">
            {activeTab === 'clone' && <ClonePage />}
            {activeTab === 'update-tag' && <UpdateTagPage />}
          </div>
        </div>
      </div>
      <footer className="footer">powered by panarin</footer>
    </div>
  )
}

export default App
