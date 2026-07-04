# iMessage Text Blast

A native macOS desktop app for sending personalized bulk iMessages (and SMS) to groups of contacts — built with Electron and Vue 3.

Send a templated message to dozens of contacts at once, schedule sends for later, space messages out with a delay so they don't all fire simultaneously, and automatically fall back to SMS when a recipient doesn't use iMessage.

## Features

- **Groups & Contacts** — Sync your macOS Contacts, organize recipients into groups, and send to either individual contacts or whole groups.
- **Message Templates** — Save reusable message templates with personalization tokens (e.g. first name) and attachments.
- **Live Preview** — See exactly what each recipient will receive before you send, including per-contact personalization.
- **Scheduled Sends** — Schedule a message to go out at a future date/time, even if the app is closed (runs via a `launchd`-managed background process).
- **Send Buffer** — Add a delay (1–60s) between each message in a bulk send so they deliver gradually instead of all at once.
- **Automatic SMS Fallback** — If iMessage delivery fails for a contact, the app automatically resends via SMS and remembers that preference for future sends (requires Full Disk Access).
- **Attachments** — Attach images/files to a send.
- **Send History** — Review past sends, recipients, and delivery status.
- **Mac Notifications** — Get notified when a scheduled or buffered send finishes delivering.
- **Light / Dark Mode**

## Tech Stack

- **Electron** — desktop shell, native macOS integration (AppleScript automation, Contacts, Notifications)
- **Vue 3** (Composition API) — UI
- **Vite** — dev server / build tooling
- **better-sqlite3** — local app database (groups, templates, send history, scheduled sends)
- **AppleScript** (`osascript`) — drives Messages.app to actually send messages
- **launchd** — keeps scheduled sends running even if the app is closed

## Requirements

- macOS 11.0 (Big Sur) or later — required by Electron 29; will not run on Windows/Linux

## Installation

### Which version to download

The Releases page has two downloads — one for Apple Silicon Macs and one for Intel Macs. To find out which chip your Mac has:

1. Click the  menu in the top-left corner of your screen.
2. Select **About This Mac**.
3. Look at the **Chip** (Apple Silicon) or **Processor** (Intel) line:
   - If it says **Apple M1**, **M2**, **M3**, **M4** (or any variant) → download `iMessage Text Blast-x.x.x-arm64.dmg`
   - If it says **Intel** → download `iMessage Text Blast-x.x.x.dmg`

### Steps

1. Download the correct `.dmg` for your Mac from the [Releases](../../releases) page.
2. Open the `.dmg` and drag **iMessage Text Blast** into your Applications folder.
3. Open **Terminal** (search "Terminal" in Spotlight) and run the following command:

   ```
   xattr -r -d com.apple.quarantine "/Applications/iMessage Text Blast.app"
   ```

   **AFTER DRAGGING THE APP TO APPLICATIONS, YOU MUST RUN THIS COMMAND IN TERMINAL BEFORE OPENING THE APP. WITHOUT IT, MACOS WILL SAY THE APP IS DAMAGED AND PREVENT IT FROM OPENING.**

4. Launch the app from Applications (or Spotlight).

On first run, macOS will prompt you to grant the following permissions:

| Permission | Required? | Why |
|---|---|---|
| **Automation (Messages)** | Required | Lets the app send messages via Messages.app |
| **Contacts** | Required | Imports your contacts to build groups and personalize messages |
| **Full Disk Access** | Optional | Reads `chat.db` to detect iMessage vs. SMS and enable automatic fallback |
| **Notifications** | Optional | Alerts you when scheduled/buffered sends complete |

## For Developers

If you'd rather run the app from source:

```bash
npm install
npm run dev
```

To build your own `.dmg`:

```bash
npm run build
```

This builds the Vue frontend with Vite and packages the app with `electron-builder`, producing a `.dmg` and `.zip` in `dist/`.

Requires Node.js 18+ and Xcode Command Line Tools (for native module compilation).

## Project Structure

```
index.js                   Electron main process — window, IPC handlers, scheduling watcher
preload.js                 Context bridge exposing IPC to the renderer
buffer-send-helper.js       Detached process for buffered (delayed) sends
scheduled-send-helper.js    Detached process for scheduled sends (launchd-driven)
db/                         SQLite schema & queries
src/
  App.vue                  Root component, sidebar, global state
  components/               UI components (groups, templates, scheduling, previews, etc.)
  services/                 Send logic, contacts sync, chat.db access, scheduling
```

## How Sending Works

1. Messages are rendered from a template with per-contact personalization.
2. The app attempts delivery via iMessage using AppleScript.
3. If Full Disk Access is granted, it polls `chat.db` to detect whether the message actually delivered via iMessage or failed.
4. On failure, it automatically retries via SMS and marks the contact as SMS-preferred for future sends.
5. Scheduled and buffered sends run in detached background processes so they complete even if the app is closed or quit mid-send.

## Privacy

iMessage Text Blast is designed with privacy as a core principle. All data stays on your device — nothing is ever transmitted to an external server.

**What the app stores locally:**
- Contacts you import (synced from your macOS Contacts app or a CSV file)
- Groups and their members
- Message templates
- Send history and delivery status
- Scheduled sends

All of this is stored in a SQLite database on your machine. No cloud account, no sync, no backend.

**What the app never does:**
- Transmit your contacts, messages, or any personal data to any server
- Read the content of your existing messages (only delivery metadata from `chat.db`)
- Store your Apple ID, iCloud credentials, or any authentication tokens
- Run in the background beyond completing an in-progress scheduled or buffered send

The source code is fully open — you can audit exactly what the app does at any time.

## License

Personal project — no license specified.
