# Enterprise IT Support Agentic RAG Copilot

A working enterprise IT support assistant that answers from the company's private knowledge base first, falls back to current web information when internal evidence is insufficient, and exposes every routing decision in an agent trace.

## What problem it solves

IT guidance is usually split between internal policies, runbooks, and changing vendor documentation. A conventional chatbot can invent company-specific rules or give stale generic advice. This application:

- grounds company questions in an indexed private knowledge base;
- grades retrieved evidence before answering instead of assuming every search result is useful;
- uses Tavily web search only when private evidence is weak;
- rewrites and retries a weak query once, then refuses to guess if evidence is still insufficient;
- cites the private documents or web pages used for the final answer;
- records the question, selected source, and workflow trace in SQLite for auditing;
- lets an administrator add PDF, TXT, Markdown, and DOCX documents from the web UI.

The included sample knowledge base covers common topics such as VPN access, password resets, MFA, laptop setup, software access, security, email, devices, and troubleshooting.

## Prerequisites

Application execution is Docker-only. Install Docker Desktop, or Docker Engine with the Compose v2 plugin, and verify that `docker compose version` succeeds.

## First-time setup

### 1. Create `.env`

Create a `.env` file in the repository root:

```dotenv
OPENAI_API_KEY=your-openai-api-key
PINECONE_API_KEY=your-pinecone-api-key
TAVILY_API_KEY=your-tavily-api-key

# Change this before allowing document uploads.
ADMIN_API_KEY=replace-with-a-secret-value

# Optional overrides (these are the defaults).
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
PINECONE_INDEX_NAME=fde-it-support-rag
PINECONE_NAMESPACE=company-it-kb
TOP_K=4
MAX_RETRIES=1
```

OpenAI is used for routing, grading, response generation, query rewriting, and embeddings. Pinecone stores private knowledge vectors. Tavily supplies the external fallback search.

The app creates the Pinecone serverless index automatically in AWS `us-east-1` with cosine similarity. The index dimension must match the embedding model. If an index with the configured name exists with a different dimension, the current implementation deletes and recreates it, so use a dedicated index name.

Do not put spaces around `=` or quote variable names; Docker Compose uses this same file.

### 2. Start the application

Production is the default quick start:

```powershell
docker compose up --build -d
docker compose ps
```

Open <http://127.0.0.1:8080>. The health endpoint is available at <http://127.0.0.1:8080/api/health>.

### 3. Index the sample company knowledge base

After the application is running, execute the ingestion script inside the application container:

```powershell
docker compose exec app python ingest_sample_kb.py
```

This loads the files in `data/sample_kb`, splits them into overlapping chunks, creates OpenAI embeddings, and writes the vectors to the configured Pinecone namespace. Run it once for each new Pinecone index or namespace.

Try questions such as:

- `How do I connect to the company VPN?`
- `What is our password reset policy?`
- `What is the latest Microsoft Teams outage guidance?`

## Docker development

The development Compose stack runs Vite and FastAPI separately. Both use hot reload; Vite polls for changes so file watching remains reliable with Docker Desktop on Windows.

```powershell
docker compose -f compose.dev.yml up --build
```

Open the React application at <http://127.0.0.1:5173>. FastAPI and its interactive documentation remain available at <http://127.0.0.1:8080/docs>.

Index the bundled sample knowledge base in development when required:

```powershell
docker compose -f compose.dev.yml exec backend python ingest_sample_kb.py
```

Stop the development stack while preserving its named volumes:

```powershell
docker compose -f compose.dev.yml down
```

## Docker production

The production build has three boundaries: Node compiles React, a Python builder installs the backend environment, and the final Python slim stage receives only runtime dependencies, backend code, sample documents, and compiled browser assets. Node, npm, TypeScript sources, dependency caches, tests, local secrets, existing uploads, and the local audit database do not enter the final image.

Node and Python base images are pinned by digest for reproducible, tamper-evident builds. Update those digests deliberately when applying upstream runtime security updates.

Build or rebuild the hardened single-service stack:

```powershell
docker compose up --build -d
docker compose ps
```

Open <http://127.0.0.1:8080>. Production Compose runs as an unprivileged user with a read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, a bounded `/tmp` tmpfs, persistent audit/upload volumes, a health check, and `restart: unless-stopped`.

View logs and stop the application:

```powershell
docker compose logs -f app
docker compose down
```

Named volumes survive `docker compose down`. Use `docker compose down --volumes` only when you intentionally want to delete audit and upload data.

Index the bundled sample knowledge base after startup when required:

```powershell
docker compose exec app python ingest_sample_kb.py
```

No API keys are used during image construction. Never place credentials in `Dockerfile`, build arguments, or copied frontend environment files.

## Docker troubleshooting

Check service state and health:

```powershell
docker compose ps
docker inspect --format '{{.State.Health.Status}}' enterprise-it-rag-app-1
```

Follow production or development logs:

```powershell
docker compose logs -f app
docker compose -f compose.dev.yml logs -f backend frontend
```

Recreate containers after configuration or dependency changes:

```powershell
docker compose up --build --force-recreate -d
docker compose -f compose.dev.yml up --build --force-recreate
```

If port `8080` or `5173` is already allocated, stop the other stack before starting the desired one:

```powershell
docker compose down
docker compose -f compose.dev.yml down
```

These commands preserve named volumes. The following commands are destructive and permanently remove the corresponding audit database and uploaded documents:

```powershell
docker compose down --volumes
docker compose -f compose.dev.yml down --volumes
```

To reclaim only unused Docker build cache, use `docker builder prune` and review Docker's confirmation prompt. Avoid broad system prune commands unless you intend to remove resources belonging to other projects.

## Frontend quality checks

From `frontend/`:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

## How it works

The application is a FastAPI service with a Vite-built React and TypeScript interface. Development uses Vite's proxy; production serves the compiled SPA from FastAPI, so both modes use relative `/api` URLs without CORS configuration. Its agent is implemented as a LangGraph state machine:

1. An OpenAI model routes greetings to a direct response and IT questions to retrieval.
2. Relevant chunks are retrieved from the Pinecone private knowledge base.
3. The model grades whether those chunks are sufficient and specific.
4. Good private evidence produces a knowledge-base-only answer with document citations.
5. Weak private evidence triggers a Tavily web search, whose results are graded again.
6. Good web evidence produces a clearly labeled external answer and links. Weak evidence causes one query rewrite and another private-KB/web pass.
7. If reliable evidence is still unavailable, the agent stops and recommends contacting the IT help desk rather than inventing an answer.

Each successful chat request is written to `data/audit.db`, including its UTC timestamp, question, final source, and agent trace. The UI displays the same trace and final source beside the answer.

## Adding company documents

In the UI, select **Add Company Document**, enter the value configured as `ADMIN_API_KEY`, and upload a `.pdf`, `.txt`, `.md`, or `.docx` file. The file is saved under `uploads/`, chunked into 900-character sections with 120-character overlap, embedded, and added to the configured Pinecone namespace.

The same operation is available through the API:

```powershell
curl.exe -X POST http://127.0.0.1:8080/api/ingest `
  -H "X-Admin-Key: replace-with-a-secret-value" `
  -F "file=@C:\path\to\company-runbook.pdf"
```

Do not leave the default admin key (`change-me`) in any shared or deployed environment.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Chat interface |
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/chat` | Run the agent with JSON such as `{"question":"How do I reset my password?"}` |
| `POST` | `/api/ingest` | Upload and index a supported document; requires the `X-Admin-Key` header |

Interactive FastAPI documentation is available at <http://127.0.0.1:8080/docs> while the app is running.

## Project structure

```text
app/
  api/routes.py          Chat, health, and ingestion endpoints
  core/config.py         Environment-backed settings
  rag/workflow.py        LangGraph routing, grading, retry, and generation
  rag/vectorstore.py     OpenAI embeddings and Pinecone integration
  services/ingestion.py  Document loading and chunking
  services/audit.py      SQLite query audit log
data/sample_kb/          Example internal handbook and runbook
frontend/                React, TypeScript, Vite, tests, and compiled UI source
ingest_sample_kb.py      One-time sample knowledge ingestion
Dockerfile               React build, Python build, development, and runtime stages
compose.yml              Hardened production-like stack
compose.dev.yml          Vite/FastAPI hot-reload development stack
.dockerignore            Files excluded from the Docker build context
TODO.md                  Explicitly deferred UI work
```

## Current scope

This repository is a local development/demo application. It has no user authentication, role-based document permissions, streaming responses, background ingestion queue, or production deployment configuration. The admin key protects only the ingestion endpoint; the chat and audit database are local to the running instance. Add normal enterprise authentication, secrets management, authorization, data retention controls, and production hosting safeguards before using real sensitive company content.
