# ChatGPT Obsidian Bridge

Local bridge between a Chrome extension and an Obsidian plugin for selectively importing messages from the currently open ChatGPT conversation.

Project location:

```text
D:\wendang\New project 2
```

## Phase 1 Scope

- Parse the current ChatGPT conversation from the active tab
- Show messages in the extension popup
- Let the user choose which messages to import
- Send selected messages to a local Obsidian plugin over `127.0.0.1:28765`
- Write Markdown notes into the Obsidian vault
- Build a basic full-text index
- Search imported conversations inside Obsidian

Out of scope:

- ChatGPT export package import
- Cookie access
- credential storage for ChatGPT accounts
- private ChatGPT API calls
- login simulation
- CAPTCHA or risk-control bypass

## Structure

```text
chatgpt-obsidian-bridge/
├─ chrome-extension/
│  ├─ manifest.json
│  ├─ package.json
│  ├─ vite.config.ts
│  └─ src/
├─ obsidian-plugin/
│  ├─ manifest.json
│  ├─ package.json
│  ├─ main.ts
│  └─ src/
└─ README.md
```

## Chrome Extension

Permissions:

- `activeTab`
- `scripting`
- `storage`

Host permissions:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `http://127.0.0.1:28765/*`

Build:

```powershell
cd "D:\wendang\New project 2\chrome-extension"
npm install
npm run build
```

Load in Chrome from:

```text
D:\wendang\New project 2\chrome-extension\dist
```

### Popup Actions

- `Select all`
- `Unselect all`
- `Import selected to Obsidian`
- `Import selected as new note`
- `Import segments as notes`

For segmented imports, selected messages can be marked with `Start a new note here`.

## Obsidian Plugin

Build:

```powershell
cd "D:\wendang\New project 2\obsidian-plugin"
npm install
npm run build
```

Installed plugin location in the current vault:

```text
D:\obsidion\Obsidian\study\stydy\.obsidian\plugins\chatgpt-obsidian-bridge
```

HTTP endpoints:

- `GET /health`
- `POST /import`
- `POST /reindex`

All requests bind to `127.0.0.1:28765`. Import and reindex requests require `X-Bridge-Token`.

## Output Paths

Main conversation note:

```text
ChatGPT/Conversations/YYYY/MM/{clean-title}-{conversationId}.md
```

Separate note import:

```text
ChatGPT/Conversations/YYYY/MM/{clean-title}-{conversationId}-part-{message-range}.md
```

Segmented import:

```text
ChatGPT/Conversations/YYYY/MM/{clean-title}-{conversationId}-segment-{message-range}.md
```

## Frontmatter

Imported documents include:

- `document_id`
- `source: chatgpt-web`
- `conversation_id`
- `title`
- `url`
- `captured_at`
- `import_mode`
- `message_range`
- `tags`
- `summary_status: pending`
- `index_status: indexed`

## Validation Notes

Verified locally:

- Chrome extension build passes
- Obsidian plugin build passes
- parser now filters empty or unparsed message blocks instead of importing them as normal selected messages
- document preparation logic produces:
  - one updated conversation note in `selected` mode
  - one separate note in `separate_note` mode
  - multiple notes in `segmented` mode
- the currently installed Obsidian plugin server accepts authenticated imports over `127.0.0.1:28765`

Partially verified:

- live Obsidian HTTP import path was exercised successfully

Not fully verified in this session:

- end-to-end parsing against a live logged-in ChatGPT page after manual Chrome reload
- end-to-end segmented import through the currently running Obsidian UI without manually reloading the plugin after file replacement

## Security Boundaries

- no Cookie reads
- no ChatGPT login credential storage
- no private ChatGPT API calls
- local-only HTTP bridge
- shared bridge token required on both sides
