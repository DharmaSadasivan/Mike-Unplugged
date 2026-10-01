# Mike Unplugged

**Open-source legal AI that runs on your own computer, with any local model you already have.**

Mike Unplugged is a fork of [mike-local](https://github.com/hamiltonmidway/mike-local) by hamiltonmidway, and derived from Will Chen's original work [Mike](https://github.com/open-legal-products/mike), the open-source legal AI platform. Mike Unplugged needs no cloud services, no external database and no API keys, and allows you to easily work with local models that you've already installed. Open the model menu, click **Scan for local models**, tick the models you want, and start working. Your documents and questions stay on your machine.

Licensed AGPL-3.0, the same as upstream.

---

## What is different in this fork

The first table shows how Mike Unplugged differs from the original Mike by Will Chen. The second table shows how Mike Unplugged differs from the mike-local fork by hamiltonmidway, which formed the basis of Mike Unplugged.

### 1. Compared with [Mike](https://github.com/open-legal-products/mike)

| Area | Mike | Mike Unplugged |
|---|---|---|
| Database and login | Supabase Postgres and Supabase Auth | One JSON file on your computer (`backend/data/local-db.json`) and a single local user. No database server. |
| Document storage | Cloudflare R2-compatible object storage (RustFS in Docker) | Folder on your computer (`backend/data/storage/`). |
| How you run it | Docker Compose stack (Mike, Supabase, RustFS, email capture, Redis) | Two Node.js commands. No Docker. |
| Secrets to set before first start | `DOWNLOAD_SIGNING_SECRET` and `USER_API_KEYS_ENCRYPTION_SECRET` | None |
| Local model apps | Ollama. Other OpenAI-compatible servers through one `OLLAMA_BASE_URL` address. | Scans for Ollama, LM Studio, llama.cpp / LocalAI, Jan, vLLM, KoboldCpp and text-generation-webui at the same time, plus addresses you type |
| Which local models appear | Every model in `ollama list` appears automatically | You scan, then tick the models you want. Only ticked models appear. |
| Cloud providers | Anthropic, Google Gemini, OpenAI, and routers (OpenRouter and others) | Anthropic and Google Gemini only, both optional |
| Error reporting | Sends error reports to the Mike project's Sentry by default (you can turn it off) | No error reporting to any outside service |
| Other features | CourtListener case-law research, Microsoft Word add-in, MCP connectors, Google Drive | Not included |

### 2. Compared with [mike-local](https://github.com/hamiltonmidway/mike-local)

| Area | mike-local | Mike Unplugged |
|---|---|---|
| Local model list | Fixed in the source code: `gemma4:latest`, `gemma3:4b`, `llama3.2:3b`. Other models need a code change. | No fixed list. Click **Scan for local models**, tick the models you want, click **Enable**. |
| Where you find local models | Model menu only | Model menu (**Scan for local models…**) and **Settings → Models & API Keys → Scan this computer** |
| Disable a local model | Code change | Click the **X** next to the model in Settings, or untick it in the scan window |
| Local model apps | Ollama only | Ollama, LM Studio, llama.cpp / LocalAI, Jan, vLLM, KoboldCpp, text-generation-webui and any other OpenAI-compatible server |
| Model on another computer | Only one Ollama address (`OLLAMA_BASE_URL`) | Type any address in the scan window, or list addresses in `LOCAL_LLM_ENDPOINTS` |
| Model that does not support tools | The request fails | Mike sends the request again without tools and continues as plain chat. For Ollama, Mike also reads tool support during the scan and does not send tools to models that cannot use them. |
| Chat titles with no API key | Uses Claude Haiku, which fails without a key | Uses your first enabled local model |
| Tabular review with no API key | Defaults to Claude Sonnet, which fails without a key | Uses your first enabled local model |
| Reasoning models in one-step tasks (titles, column prompts) | Reasoning text (`<think>…</think>`) can appear in the result | Reasoning text is removed |
| Local model app not running | The chat ends with no explanation | The chat shows a message that says which address did not answer and what to do |
| Failed title generation | An error sentence can be saved as the chat title | The error is handled and the title is not replaced with an error sentence |
| API keys in `backend/.env.example` | Anthropic key placeholder; README tells you to add a key | Both keys empty; README says keys are optional |

The scan only reads the model list from each app. It does not download, change or delete anything.

Supported model apps and the addresses Mike checks:

| App | Default address | Notes |
|---|---|---|
| [Ollama](https://ollama.com) | `http://localhost:11434` | Also reads tool and reasoning support for each model |
| [LM Studio](https://lmstudio.ai) | `http://localhost:1234` | Start the local server in LM Studio first |
| llama.cpp server / LocalAI | `http://localhost:8080` | OpenAI-compatible API |
| [Jan](https://jan.ai) | `http://localhost:1337` | OpenAI-compatible API |
| vLLM | `http://localhost:8000` | OpenAI-compatible API |
| KoboldCpp | `http://localhost:5001` | OpenAI-compatible API |
| text-generation-webui | `http://localhost:5000` | OpenAI-compatible API |
| Any other OpenAI-compatible server | You type the address | For example, a GPU machine on your network |

---

## Setup

You need:

- [Node.js](https://nodejs.org) 20 or later
- At least one local model app with at least one model (for example, Ollama with `ollama pull qwen3:8b`)
- LibreOffice, for DOC/DOCX to PDF conversion

**1. Install the dependencies**

```bash
npm install --prefix backend
npm install --prefix frontend --legacy-peer-deps
```

`--legacy-peer-deps` is necessary because of an upstream version conflict between `next` and an unused Cloudflare package.

> **Windows and OneDrive:** do not keep this folder in a OneDrive (or Dropbox) folder, or pause sync while you install. The sync app locks files while npm writes them, and the install fails with `ENOTEMPTY` errors.

**2. Create the settings files**

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

For local models only, you do not need to change anything in these files.

**3. Start the backend** (terminal 1)

```bash
npm run dev --prefix backend
```

**4. Start the frontend** (terminal 2)

```bash
npm run dev --prefix frontend
```

**5. Open** `http://localhost:3000`, then open the model menu and click **Scan for local models**.

### Optional settings (`backend/.env`)

| Setting | Use |
|---|---|
| `OLLAMA_BASE_URL` | Ollama is not at `http://localhost:11434` (for example, when the backend runs in Docker) |
| `LOCAL_LLM_ENDPOINTS` | Extra addresses to scan every time, separated by commas |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Only if you also want cloud models |

### Local data

- JSON database: `backend/data/local-db.json`
- Document files: `backend/data/storage/`
- Default local user: `local@mike.local`

No Supabase database, Supabase Auth project or R2/S3 bucket is required.

### Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

---

## How it works (for developers)

- `backend/src/lib/llm/localDiscovery.ts` probes the known addresses. For each address it tries the Ollama API (`/api/tags`, `/api/show`), then the LM Studio API (`/api/v0/models`), then the generic OpenAI API (`/v1/models`).
- `backend/src/lib/llm/localModels.ts` stores the enabled models on the user profile (`enabled_local_models`). Each local model has an id of the form `local:<ollama|openai>@<host>:<port>/<model name>`, so a request can reach the model even without the saved record.
- `backend/src/lib/llm/ollama.ts` talks to Ollama. `backend/src/lib/llm/openaiCompatible.ts` talks to every other app. Both support streaming, reasoning output and tool calls.
- API routes: `GET /local-models/scan`, `GET /local-models/enabled`, `PUT /local-models/enabled`.
- Frontend: `frontend/src/app/components/models/LocalModelScanModal.tsx` (scan window) and `frontend/src/app/lib/modelCatalog.ts` (the list of models the user can pick).

---

## Lineage and credits

Mike Unplugged builds on three earlier projects. All credit to their authors.

**Mike (willchen96) → mike-oss (mikeOnBreeze) → mike-local (hamiltonmidway) → Mike-Unplugged (DharmaSadasivan)**

1. **[Mike](https://github.com/willchen96/mike)** by Will Chen (willchen96). The original open-source legal AI platform, built as an alternative to Harvey. See [mikeoss.com](https://mikeoss.com/) and [this interview](https://www.artificiallawyer.com/2026/05/04/mike-the-open-source-legal-ai-platform-will-chen-interview/).
2. **[mike-oss](https://github.com/mikeOnBreeze/mike-oss)** by Mike Brown (mikeOnBreeze). Replaced the cloud services (Supabase Postgres, Supabase Auth, Cloudflare R2) with a local JSON file and the local file system.
3. **[mike-local](https://github.com/hamiltonmidway/mike-local)** by hamiltonmidway. Added offline chat through Ollama with a fixed list of models.
4. **Mike-Unplugged** by DharmaSadasivan (this fork). Replaces the fixed list with a scan of your computer, and adds LM Studio, llama.cpp, Jan, vLLM and other OpenAI-compatible apps.

AI output can be wrong. Answers are not legal advice. Check important results yourself.
