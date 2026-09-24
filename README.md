# ScheduleChat

ScheduleChat is a personal planning, scheduling, and time-tracking application with an AI copilot. It combines task management, recurring schedules, goals, timers, workload planning, and conversational AI in one workspace.

The AI copilot can inspect your schedule, analyze unfinished work, plan upcoming sprints, and propose changes to your tasks. All write operations pass through an explicit **propose → approve → execute** workflow so the AI cannot silently modify your data.

## Features

### Planning and task management

- Organize work into tabs such as Projects, DSA, System Design, or custom categories.
- Create, edit, move, schedule, archive, and track tasks.
- Track task estimates, progress percentages, completion state, and accumulated time.
- Schedule tasks for specific dates or for the current day.
- Drag-and-drop task organization using `dnd-kit`.
- View daily workload and remaining capacity.
- Support weekday and weekend planning limits:
  - Weekdays: up to 8 hours
  - Weekends: up to 10 hours

### Time tracking

- Start and manage task timers.
- Support active timer slots and countdown/running states.
- Record total tracked time for individual tasks.
- View time summaries grouped by tab.
- Inspect active timers and their associated tasks.

### Calendar and recurring schedules

- Create recurring scheduled tasks and routines.
- Supported recurrence patterns include:
  - Daily
  - Weekdays
  - Weekly
  - Biweekly
  - Custom days of the week
- Configure start times, durations, descriptions, and reminders.
- Use recurring schedule data when planning sprints to avoid conflicts.

### Goals and sprint planning

- Store long-term goals and syllabus or roadmap context.
- Maintain an AI sprint log containing planning assumptions and retrospectives.
- Use the built-in **Plan Next 7-Day Sprint** command.
- Ask the AI to:
  - Review goals
  - Find unfinished tasks from the last several days
  - Inspect current workload
  - Respect weekday and weekend limits
  - Create a proposed batch of sprint tasks
  - Record sprint notes and assumptions

### AI Copilot

ScheduleChat supports two interaction modes:

#### Suggest mode

Suggest mode allows the AI to inspect your schedule and provide recommendations without directly changing your data.

For safety, Suggest mode requires a separate read-only MongoDB connection configured through `MONGODB_READONLY_URI`. The application does not silently fall back to the primary database connection when this variable is missing.

#### Update mode

Update mode allows the AI to create proposals for changes such as:

- Creating individual tasks
- Creating batches of sprint tasks
- Updating task properties
- Moving tasks between tabs
- Scheduling or unscheduling tasks
- Creating tabs
- Archiving tasks
- Creating recurring scheduled tasks
- Deleting recurring scheduled tasks
- Updating the AI sprint log

Write tools never directly modify the database during the AI request. They create an `AIAction` with a `proposed` status instead.

### Proposal approval and undo workflow

AI-generated writes follow this process:

```text
User request
    ↓
AI reads relevant schedule context
    ↓
AI proposes one or more changes
    ↓
User reviews the proposal
    ↓
User approves or rejects it
    ↓
Approved changes are executed
    ↓
Executed changes can be reviewed or undone
```

This boundary is shared across the supported AI engines. The common tool executor validates tool arguments with Zod, executes read tools directly, and persists write proposals for later approval.

## AI engines

The active AI architecture supports a modern engine and a preserved legacy engine.

### Modern Engine v2

The Modern Engine is the default engine and is selected using `AI_ENGINE_VERSION=v2`.

It provides:

- Google `@google/genai` SDK support
- Google GenAI Interactions API integration
- Server-side interaction continuation through `previous_interaction_id`
- Native thought and interaction step handling
- Function-call execution through the shared ScheduleChat tool registry
- Antigravity managed cloud-agent support
- Local OpenAI-compatible model support through LM Studio
- Real-time reasoning and tool progress updates
- End-to-end cancellation support for local inference

The engine gateway in `lib/ai/index.ts` routes requests to the appropriate implementation:

```text
Local model selected
    → Modern Engine v2
    → LM Studio executor

Antigravity selected
    → Modern Engine v2
    → Google GenAI Interactions API / remote agent

Cloud Gemini model selected with v2
    → Modern Engine v2
    → Google GenAI Interactions API
```

### Legacy Engine v1

The Legacy Engine remains available as an explicit rollback path using `AI_ENGINE_VERSION=v1` or the UI engine selector.

It preserves the existing provider implementations, including:

- `@google/generative-ai`
- Anthropic tool-use support
- Manual multi-step turn state
- Gemini thought-signature handling and compatibility workarounds

The legacy engine is intentionally kept separate from the v2 implementation so that the modern architecture can be tested without removing the previous execution path.

## Local models with LM Studio

The Modern Engine can use local models hosted by LM Studio or another OpenAI-compatible local server.

The default local endpoint is:

```text
http://127.0.0.1:1234/v1
```

The application discovers local models through:

```text
GET /v1/models
```

Embedding-only models are excluded from the model selector. Discovered models are displayed with the `local/` prefix, for example:

```text
local/qwen2.5- coder
```

When a local model is selected:

- Requests are sent to `/v1/chat/completions`.
- OpenAI-compatible function tools are provided.
- Responses are consumed using streaming SSE.
- `reasoning_content` is extracted from reasoning models such as Qwen or DeepSeek-R1.
- `<think>...</think>` blocks are extracted when models return reasoning inside normal content.
- Reasoning is displayed in the ChatPanel thought-process accordion.
- Streamed tool calls are reconstructed across multiple chunks.
- Tool results are returned through the same proposal and approval workflow.
- The cloud serverless per-step timeout is disabled for local models.
- The Stop button propagates an `AbortSignal` to the local request and LM Studio connection.

To use local models:

1. Install and launch [LM Studio](https://lmstudio.ai/).
2. Download a compatible chat or reasoning model.
3. Start LM Studio's local server.
4. Confirm that the server exposes an OpenAI-compatible API.
5. Set `LOCAL_AI_BASE_URL` if using a non-default endpoint.
6. Refresh the model list inside the ScheduleChat model selector.
7. Select a model marked `Local`.

Example:

```dotenv
LOCAL_AI_BASE_URL=http://127.0.0.1:1234/v1
AI_ENGINE_VERSION=v2
```

Local models do not require a Gemini or Anthropic API key for inference. However, the application still requires the normal database, authentication, and application configuration.

## Cloud models and Antigravity

The model selector dynamically combines:

- Compatible Gemini models discovered from the Google Generative Language API
- Fallback Gemini models when model discovery fails
- The Antigravity managed cloud agent
- Locally discovered OpenAI-compatible models

Cloud Gemini models are cached for five minutes. Local model discovery is checked dynamically so models can appear or disappear when LM Studio is started or stopped.

The Antigravity model is represented as:

```text
antigravity-preview-05-2026
```

It uses the Google GenAI Interactions API with a remote environment.

## Real-time chat behavior

The chat endpoint uses Server-Sent Events when streaming is enabled.

The browser receives events such as:

- `status`
- `thinking`
- `tool_call`
- `tool_result`
- `step_done`
- `done`
- `stopped`
- `error`
- `heartbeat`

The ChatPanel displays:

- Live status updates
- Expandable thought-process sections
- Tool execution timelines
- Tool results and errors
- Per-tool execution duration
- Retry messages
- Provider error details
- Active proposals requiring confirmation

The frontend retries failed atomic steps up to three times. Cloud requests have a per-step safety timeout, while local model requests can run for longer periods to support complex local reasoning workloads.

## Security and safety

### Authentication

The application uses NextAuth credentials authentication with a seeded single-user account.

Protected routes and API handlers resolve the current user through the session before accessing application data.

### Input validation

Request payloads are validated with Zod, including:

- Chat requests
- Engine version selection
- Model identifiers
- Task properties
- Date formats
- Recurrence configuration
- AI tool arguments

### User isolation

Database queries include the authenticated `userId` so tasks, tabs, conversations, timers, goals, and AI actions remain associated with the correct user.

### Read-only Suggest mode

Suggest mode requires an explicit read-only MongoDB connection:

```dotenv
MONGODB_READONLY_URI=mongodb://readonly_user:password@localhost:27017/schedulechat
```

If this variable is not configured, Suggest mode returns an explanatory message instead of using the primary write-capable database connection.

### Rate limiting

Chat requests are rate-limited per user. The current chat route uses a capacity of 20 requests with a refill rate of 20 requests per minute.

## Technology stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Framework:** Next.js App Router
- **UI:** React
- **Styling:** SCSS Modules and global SCSS
- **Database:** MongoDB with Mongoose
- **Authentication:** NextAuth credentials provider
- **Client data fetching:** TanStack Query
- **Client state:** Zustand
- **Drag and drop:** `@dnd-kit/core`
- **Validation:** Zod
- **AI providers:**
  - Anthropic SDK
  - Legacy Google Generative AI SDK
  - Modern Google GenAI SDK
  - OpenAI-compatible local APIs
- **Streaming:** Server-Sent Events
- **Logging:** Pino
- **Testing:** Vitest
- **Icons:** Lucide React
- **Markdown and diagrams:** DOMPurify and Mermaid
- **Analytics:** Vercel Analytics

## Project structure

```text
.
├── app/
│   ├── (app)/                 Authenticated application routes and pages
│   ├── api/                   Next.js API route handlers
│   │   ├── actions/           Approve, reject, execute, and undo AI actions
│   │   ├── chat/              Streaming and non-streaming AI chat endpoint
│   │   ├── models/            Cloud and local model discovery
│   │   ├── conversations/     Conversation management
│   │   ├── tasks/             Task API endpoints
│   │   ├── timers/            Timer API endpoints
│   │   ├── goals/             Goals and sprint context
│   │   └── ...                Other application API routes
│   ├── login/                 Login page
│   ├── globals.scss           Global styles
│   └── layout.tsx             Root layout and application providers
│
├── components/
│   ├── board/                 Task board and tab-based task organization
│   ├── calendar/              Calendar views and scheduling UI
│   ├── chat/                  AI ChatPanel, Markdown, traces, and proposals
│   ├── dashboard/             Dashboard widgets and summaries
│   ├── goals/                 Goal and sprint-log interfaces
│   ├── notifications/         Notification UI
│   ├── scheduled/              Recurring schedule interfaces
│   ├── timers/                Timer controls and active timer views
│   ├── ui/                    Shared UI components
│   ├── AppShell.tsx            Authenticated application shell
│   └── *.module.scss          Component-scoped styles
│
├── lib/
│   ├── ai/
│   │   ├── index.ts           AI engine gateway
│   │   ├── stepTurn.ts        Preserved legacy v1 multi-step engine
│   │   ├── tools.ts           Shared read and propose tool registry
│   │   ├── context.ts         User schedule context construction
│   │   ├── systemPrompt.ts    Mode-specific AI system prompts
│   │   ├── providers/          Anthropic, Gemini, and shared provider code
│   │   └── v2/                 Modern GenAI and local model engine
│   │       ├── client.ts       Cached Google GenAI client
│   │       ├── gemini.ts       Interactions API and Antigravity runner
│   │       ├── local.ts        LM Studio streaming executor
│   │       ├── tools.ts        GenAI and OpenAI tool adapters
│   │       └── index.ts        Modern engine entrypoint
│   ├── api/                    Client-side API hooks and DTOs
│   ├── auth.ts                 NextAuth configuration
│   ├── authProvider.tsx        Client authentication provider
│   ├── calendar/               Recurrence and calendar helpers
│   ├── db/
│   │   ├── connect.ts          MongoDB connection management
│   │   └── models/             Mongoose models
│   ├── realtime/               Realtime and event helpers
│   ├── scheduled/              Recurring task helpers
│   ├── security/               Security-related helpers
│   ├── store/                  Zustand stores
│   ├── timers/                 Timer calculations and helpers
│   ├── validation/             Zod request schemas
│   ├── env.ts                  Cached environment validation
│   ├── logger.ts               Structured logging
│   ├── queryClient.tsx         TanStack Query provider
│   ├── rateLimit.ts            Request rate limiting
│   └── session.ts              Current-user session helpers
│
├── scripts/
│   └── seed.ts                 User, default tabs, and sample task seeding
│
├── styles/
│   └── _tokens.scss            Shared SCSS design tokens
│
├── types/
│   └── next-auth.d.ts          NextAuth type augmentation
│
├── .env.example                Environment variable template
├── next.config.mjs             Next.js configuration
├── package.json                Scripts and dependencies
├── tsconfig.json               TypeScript configuration
├── vitest.config.mts           Vitest configuration
└── LICENSE
```

## Runtime architecture

A typical streamed chat request follows this flow:

```text
ChatPanel.tsx
    ↓ POST /api/chat
app/api/chat/route.ts
    ↓ authenticate, validate, load conversation and context
lib/ai/index.ts
    ↓ select engine
┌───────────────────────┬─────────────────────────────┐
│ Modern Engine v2      │ Legacy Engine v1             │
│                       │                             │
│ Gemini / Antigravity │ @google/generative-ai       │
│ LM Studio             │ Anthropic tool-use path     │
└───────────┬───────────┴──────────────┬──────────────┘
            ↓                          ↓
       Shared tool registry: lib/ai/tools.ts
            ↓
  Read operation or proposed AIAction
            ↓
  SSE progress events returned to ChatPanel
            ↓
  User approves, rejects, or later undoes changes
```

The chat route loads recent conversation history, builds a context snapshot from the user's goals and schedule, and combines it with the mode-specific system prompt. The selected engine then executes one step at a time until it returns a final response or another turn state.

## Requirements

Before starting, install:

- Node.js 20 or newer
- npm
- MongoDB 7 or a compatible MongoDB deployment
- At least one supported AI option:
  - Anthropic API key
  - Gemini API key
  - LM Studio or another OpenAI-compatible local model server

The modern `@google/genai` SDK requires Node.js 20 or newer.

## Local setup

### 1. Clone the repository

```bash
git clone https://github.com/Aakarsh-Lohani/schedulechat.git
cd schedulechat
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Then edit `.env.local`.

A minimal Anthropic configuration:

```dotenv
AI_PROVIDER=anthropic
AI_ENGINE_VERSION=v2

ANTHROPIC_API_KEY=your_anthropic_api_key

MONGODB_URI=mongodb://localhost:27017/schedulechat
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000

APP_USER_EMAIL=you@example.com
APP_USER_PASSWORD=change-this-password
```

A Gemini and Modern Engine configuration:

```dotenv
AI_PROVIDER=gemini
AI_ENGINE_VERSION=v2

GEMINI_API_KEY=your_gemini_api_key

MONGODB_URI=mongodb://localhost:27017/schedulechat
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000

APP_USER_EMAIL=you@example.com
APP_USER_PASSWORD=change-this-password
```

A local LM Studio configuration:

```dotenv
AI_ENGINE_VERSION=v2
LOCAL_AI_BASE_URL=http://127.0.0.1:1234/v1

# Required only if cloud model discovery or cloud Gemini models are also used.
GEMINI_API_KEY=your_gemini_api_key

MONGODB_URI=mongodb://localhost:27017/schedulechat
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000

APP_USER_EMAIL=you@example.com
APP_USER_PASSWORD=change-this-password
```

Generate a secure NextAuth secret with:

```bash
openssl rand -base64 32
```

### 4. Start MongoDB

For a local MongoDB installation, start the MongoDB service and verify that this URI is available:

```text
mongodb://localhost:27017/schedulechat
```

Alternatively, set `MONGODB_URI` to a MongoDB Atlas or other managed MongoDB connection string.

### 5. Seed the application

The seed script creates:

- The configured application user
- Default tabs:
  - Projects
  - DSA
  - System Design
  - Project Progress
- One sample DSA task

Run:

```bash
npm run seed
```

The seed operation is safe to rerun. Existing users and tabs are not recreated.

### 6. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Sign in using the `APP_USER_EMAIL` and `APP_USER_PASSWORD` values from `.env.local`.

## Available scripts

```bash
# Start the Next.js development server
npm run dev

# Build the production application
npm run build

# Start the production server
npm run start

# Run ESLint
npm run lint

# Run the Vitest test suite
npm run test

# Seed the local database
npm run seed
```

## Environment variables

| Variable | Required | Description |
|---|---:|---|
| `AI_PROVIDER` | Yes | Primary provider for legacy/non-streaming paths: `anthropic` or `gemini`. |
| `AI_ENGINE_VERSION` | No | Engine selector: `v1` or `v2`. Defaults to `v2`. |
| `ANTHROPIC_API_KEY` | Conditional | Required when `AI_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | Conditional | Required when `AI_PROVIDER=gemini` and for cloud Gemini/GenAI operations. |
| `LOCAL_AI_BASE_URL` | No | OpenAI-compatible local API base URL. Defaults to `http://127.0.0.1:1234/v1`. |
| `MONGODB_URI` | Yes | Primary MongoDB connection string. |
| `MONGODB_READONLY_URI` | Suggest mode | Read-only MongoDB connection used by Suggest mode. |
| `NEXTAUTH_SECRET` | Yes | Secret used by NextAuth. |
| `NEXTAUTH_URL` | No | Application URL. Defaults to `http://localhost:3000`. |
| `APP_USER_EMAIL` | Seeding | Email address created by `npm run seed`. |
| `APP_USER_PASSWORD` | Seeding | Password assigned by `npm run seed`. |
| `GOOGLE_CLIENT_ID` | No | Optional Google Calendar integration credential. |
| `GOOGLE_CLIENT_SECRET` | No | Optional Google Calendar integration credential. |

Environment variables are parsed and validated lazily by `lib/env.ts`. Missing or invalid values produce a configuration error with the affected variable names.

## Important implementation details

### Shared AI tools

The tool registry in `lib/ai/tools.ts` defines both read and write-capable operations.

Read tools include:

- `getTasks`
- `getTabs`
- `getActiveTimers`
- `getTimeSummary`
- `getUnfinishedTasks`
- `getScheduledTasks`
- `getDailyWorkload`
- `getGoalContext`

Write tools use `propose*` handlers and create proposals instead of applying changes immediately.

### Model adapters

The same application-level tools are adapted to multiple provider formats:

```text
lib/ai/tools.ts
    ↓
lib/ai/v2/tools.ts
    ├── Google GenAI function format
    └── OpenAI-compatible function format
```

This allows the Modern Engine, Legacy Engine, Anthropic integration, and LM Studio integration to share the same business operations and safety rules.

### Conversation state

Long-running AI requests are split into multiple steps. Turn state can include:

- Current step number
- Selected engine version
- Provider
- Google interaction ID
- Local OpenAI-compatible messages
- Legacy Gemini contents
- Anthropic messages
- Created action IDs
- Accumulated reasoning
- Legacy Gemini thought signatures

This state is returned to the browser through `step_done` SSE events and sent back with the next request.

### Error handling

The ChatPanel categorizes common provider errors, including:

- Rate limits and quota errors
- Authentication and API key failures
- Timeouts
- Provider service failures
- Model-specific errors
- Local LM Studio connection failures

The UI displays structured error details and preserves the raw provider output for debugging.

## Current limitations

- The application is configured as a personal or single-user workspace.
- Suggest mode requires `MONGODB_READONLY_URI`.
- Local model support requires a running LM Studio-compatible server.
- Local model capabilities depend on the selected model's support for:
  - Streaming
  - Function calling
  - OpenAI-compatible chat completions
  - Reasoning output fields
- Some cloud models and Antigravity functionality may depend on preview APIs and account availability.
- The application uses SSE for streamed progress rather than WebSockets.
- The production deployment must support long-running streaming requests for cloud AI providers.
- The Legacy Engine is retained for rollback compatibility and should not be modified as part of Modern Engine changes without explicitly updating the engine compatibility contract.

## Contributing

1. Create a feature branch from the current default branch.
2. Keep provider-specific code inside the appropriate AI engine or provider module.
3. Reuse the shared tool registry instead of duplicating task or scheduling logic.
4. Preserve the propose → approve → execute safety boundary for all writes.
5. Validate new request inputs with Zod.
6. Run linting and tests before opening a pull request.

```bash
npm run lint
npm run test
npm run build
```

When changing AI behavior, test both:

- Suggest mode
- Update mode
- Cloud models
- Local models, if applicable
- Approval and rejection flows
- Stop/cancellation behavior
- Multi-step tool execution

## License

See [LICENSE](./LICENSE).
