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

## First-time setup

### 1. Create and activate the Python environment

Python 3.11 is recommended. From the repository root:

```powershell
conda create -n enterprise-it-rag python=3.11 -y
conda activate enterprise-it-rag
pip install -r requierments.txt
```

> The repository currently uses the filename `requierments.txt` (including that spelling).

### 2. Create `.env`

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

### 3. Index the sample company knowledge base

Run this once before asking company-specific questions:

```powershell
python ingest_sample_kb.py
```

This loads the files in `data/sample_kb`, splits them into overlapping chunks, creates OpenAI embeddings, and writes the vectors to the configured Pinecone namespace.

### 4. Start the application

```powershell
python run.py
```

Open <http://127.0.0.1:8080>. The development server runs with auto-reload enabled. A quick health check is available at <http://127.0.0.1:8080/api/health>.

Try questions such as:

- `How do I connect to the company VPN?`
- `What is our password reset policy?`
- `What is the latest Microsoft Teams outage guidance?`

## Run with Docker

Docker provides an additional deployment path; the local Python workflow above still works as before. The multi-stage build installs dependencies in a discarded builder stage, then copies only the virtual environment and application runtime files into a slim final image. The final container runs as an unprivileged user and does not contain the source control metadata, local `.env`, audit database, existing uploads, tests, compiler toolchain, or dependency cache.

### 1. Build the image

From the repository root, with Docker BuildKit enabled (the default in current Docker versions):

```powershell
docker build --tag enterprise-it-rag:local .
```

No API keys are passed at build time or stored in image layers.

### 2. Start the container

The application needs the same `.env` described in **First-time setup**. Use named volumes to preserve the SQLite audit log and uploaded documents when the container is replaced:

```powershell
docker volume create enterprise-it-rag-runtime
docker volume create enterprise-it-rag-uploads

docker run --name enterprise-it-rag `
  --env-file .env `
  --publish 8080:8080 `
  --mount type=volume,source=enterprise-it-rag-runtime,target=/app/runtime `
  --mount type=volume,source=enterprise-it-rag-uploads,target=/app/uploads `
  enterprise-it-rag:local
```

Open <http://127.0.0.1:8080>. Check container health with:

```powershell
docker inspect --format '{{.State.Health.Status}}' enterprise-it-rag
```

Stop and remove the container without deleting its persistent data:

```powershell
docker stop enterprise-it-rag
docker rm enterprise-it-rag
```

### 3. Index the sample knowledge base

In another terminal, after the container is running:

```powershell
docker exec enterprise-it-rag python ingest_sample_kb.py
```

This is required once for a new Pinecone index/namespace, just as it is in the local setup. The sample documents are included in the image; uploaded documents and the audit database remain in their named volumes.

To rebuild after a code or dependency change, run `docker build --tag enterprise-it-rag:local .` again, remove the old container, and start it with the same `docker run` command. Do not bake `.env` or credentials into the image with `COPY`, `ARG`, or `ENV` instructions.

## How it works

The application is a FastAPI service with a lightweight HTML/CSS/JavaScript chat interface. Its agent is implemented as a LangGraph state machine:

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
static/ + templates/     Browser chat UI
ingest_sample_kb.py      One-time sample knowledge ingestion
run.py                   Local development entry point
Dockerfile               Multi-stage production container build
.dockerignore            Files excluded from the Docker build context
```

## Current scope

This repository is a local development/demo application. It has no user authentication, role-based document permissions, streaming responses, background ingestion queue, or production deployment configuration. The admin key protects only the ingestion endpoint; the chat and audit database are local to the running instance. Add normal enterprise authentication, secrets management, authorization, data retention controls, and production hosting safeguards before using real sensitive company content.
