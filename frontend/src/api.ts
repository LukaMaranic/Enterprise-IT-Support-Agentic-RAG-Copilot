export interface Citation {
  title: string
  url?: string
}

export interface ChatResponse {
  answer: string
  source_used: string
  trace: string[]
  citations: Citation[]
  rewritten_query: string
}

export interface IngestResponse {
  message: string
  file: string
  chunks: number
  ids_created: number
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { detail?: string }
  if (!response.ok) throw new Error(data.detail ?? 'Request failed')
  return data
}

export async function askAgent(question: string): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  return readJson<ChatResponse>(response)
}

export async function ingestDocument(file: File, adminKey: string): Promise<IngestResponse> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey },
    body,
  })
  return readJson<IngestResponse>(response)
}
