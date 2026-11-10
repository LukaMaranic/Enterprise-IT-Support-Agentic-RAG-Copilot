import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { askAgent, ingestDocument, type Citation } from './api'

interface Message {
  id: number
  role: 'assistant' | 'user'
  text: string
  source?: string
  citations?: Citation[]
}

const examples = [
  'How do I connect to the company VPN?',
  'What is our password reset policy?',
  'What is the latest Microsoft Teams outage guidance?',
]

const initialMessage: Message = {
  id: 0,
  role: 'assistant',
  text: 'How can I help with IT support?\nTry: How do I connect to the company VPN?â€ or ask a question that may require current external vendor information.',
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [question, setQuestion] = useState('')
  const [trace, setTrace] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const nextId = useRef(1)
  const chatRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (chatRef.current?.scrollTo) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  const submitQuestion = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || isAsking) return
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text: trimmed }])
    setQuestion('')
    setTrace(['Running LangGraph workflow...'])
    setSource('Running')
    setIsAsking(true)
    try {
      const data = await askAgent(trimmed)
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: 'assistant', text: data.answer, source: data.source_used, citations: data.citations },
      ])
      setTrace(data.trace)
      setSource(data.source_used)
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: 'assistant', text: `Error: ${error instanceof Error ? error.message : 'Request failed'}` },
      ])
      setTrace(['Request failed'])
      setSource('Error')
    } finally {
      setIsAsking(false)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitQuestion(question)
  }

  const onQuestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitQuestion(question)
    }
  }

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div>
            <div className="brand-badge">FDE Project</div>
            <h1>IT Support<br />Agentic RAG</h1>
            <p className="muted">Private company knowledge first. External web only when evidence is weak.</p>
          </div>
          <div className="workflow-card">
            <h3>LangGraph Workflow</h3>
            {['Route question', 'Retrieve private KB', 'Grade evidence', 'Web fallback if weak', 'Rewrite & retry', 'Grounded answer'].map((step, index) => (
              <div className="flow-step" key={step}>{index + 1}. {step}</div>
            ))}
          </div>
          <button className="secondary-btn" type="button" onClick={() => setIsUploadOpen(true)}>+ Add Company Document</button>
        </aside>

        <main className="main">
          <header className="topbar">
            <div><span className="status-dot" /><span>Enterprise Knowledge Copilot</span></div>
            <span className="pill">Agentic RAG</span>
          </header>
          <section ref={chatRef} className="chat-area" aria-live="polite">
            {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
          </section>
          <section className="composer-wrap">
            <div className="examples">
              {examples.map((example) => <button className="example" type="button" disabled={isAsking} onClick={() => void submitQuestion(example)} key={example}>{example}</button>)}
            </div>
            <form className="composer" onSubmit={onSubmit}>
              <textarea aria-label="IT support question" rows={2} placeholder="Ask an IT support question..." value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={onQuestionKeyDown} required />
              <button type="submit" className="send-btn" disabled={isAsking}>{isAsking ? 'Running…' : 'Ask Agent'}</button>
            </form>
          </section>
        </main>

        <aside className="trace-panel">
          <h2>Agent Trace</h2>
          <p className="muted">Watch LangGraph decisions while the request runs.</p>
          <div className="trace-list">{trace.length ? trace.map((item, index) => <div className="trace-item" key={`${item}-${index}`}>{item}</div>) : <div className="empty">No request yet.</div>}</div>
          <div className="source-box"><span>Final Source</span><strong>{source}</strong></div>
        </aside>
      </div>
      {isUploadOpen && <UploadModal onClose={() => setIsUploadOpen(false)} />}
    </>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const [heading, ...rest] = message.text.split('\n')
  return (
    <div className={`message ${message.role}`}>
      <div className="avatar">AI</div>
      <div className="bubble">
        {message.id === 0 ? <><strong>{heading}</strong><p>{rest.join('\n')}</p></> : message.text}
        {message.source && <div className="answer-source">Source: {message.source}</div>}
        {message.citations?.length ? <div className="citations"><strong>Sources</strong><br />{message.citations.map((citation, index) => <span key={`${citation.title}-${index}`}>{citation.url ? <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a> : citation.title}<br /></span>)}</div> : null}
      </div>
    </div>
  )
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const [adminKey, setAdminKey] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const upload = async () => {
    if (!file) { setStatus('Choose a file first.'); return }
    setStatus('Indexing document...')
    setIsUploading(true)
    try {
      const data = await ingestDocument(file, adminKey)
      setStatus(`Indexed ${data.file}: ${data.chunks} chunks.`)
      setAdminKey('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Upload failed'}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="modal-head"><h2 id="upload-title">Ingest Company Document</h2><button type="button" aria-label="Close upload dialog" onClick={onClose}>Ã—</button></div>
        <p className="muted">Upload PDF, TXT, Markdown, or DOCX. The document is chunked, embedded, and indexed into Pinecone.</p>
        <input aria-label="Admin API key" type="password" placeholder="Admin API key" autoComplete="off" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} />
        <input ref={fileInput} aria-label="Company document" type="file" accept=".pdf,.txt,.md,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button type="button" className="send-btn full" disabled={isUploading} onClick={() => void upload()}>{isUploading ? 'Indexing…' : 'Index Document'}</button>
        <div className="upload-status" aria-live="polite">{status}</div>
      </div>
    </div>
  )
}
