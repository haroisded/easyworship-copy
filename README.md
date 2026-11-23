# Presenter — Worship Presentation Software

Presenter is a Windows desktop app that puts song lyrics and PowerPoint slides on a projector or LED wall, while the operator prepares the next slide on their own screen.

### Features

- **Song Library** – Write lyrics once. A blank line starts a new slide.
- **PowerPoint Import** – Import `.pptx`, `.ppt`, `.ppsx` and `.pps` files. The installed PowerPoint renders each visible slide to a 1920px PNG, so a deck is just a list of images.
- **Schedule** – Build the running order for a service, reorder it, and remove items.
- **Preview & Live** – Two panes: *Preview* (only the operator sees it) and *Live* (what the audience sees). **Go Live** sends the previewed slide out, and the preview then moves to the next slide.
- **Output Modes** – Black, Clear (background only) and Logo, toggled by button or keyboard.
- **Keyboard Control** – `Enter`/`Space` go live, arrow keys move the preview, `B`/`C`/`L` toggle modes, and double-clicking a slide sends it live at once.
- **Automatic Output Display** – Uses the saved monitor, or else the first non-primary one. Plugging or unplugging a display moves, creates or closes the output window automatically.
- **LED Wall Regions** – Output to a custom rectangle of a display, given in physical pixels the way an LED processor is configured.
- **Text Styling** – Font, maximum size with auto-shrink to fit, colour, outline, shadow and alignment.
- **Backgrounds** – Colour, image, or muted looped video, either as the default or per song.
- **Cross-fades** – Configurable fade time between slides and modes.
- **Safe Storage** – The library is saved atomically to one JSON file. An unreadable file is kept as `library.json.bad` instead of being overwritten.
- **Service-Safe** – Only one instance can run, and display sleep is blocked while the app is open.
- **Windows Installer** – NSIS setup wizard built with electron-builder.

### Tech Stack

- **Runtime:** Electron 33 (Node.js main process + Chromium renderers).
- **Language:** Plain JavaScript, with no framework and no bundler.
- **Frontend:** HTML + CSS (`control.html`, `output.html`).
- **Storage:** Local JSON file (`library.json`) in the Electron `userData` folder.
- **PowerPoint Rendering:** PowerShell + PowerPoint COM automation.
- **Packaging:** electron-builder (NSIS installer).
- **Testing:** Node's built-in `node:assert`.

## Quick Start

### Prerequisites

- **Windows** (PowerPoint import uses PowerShell and COM)
- **Node.js 14+ and npm**
- **Microsoft PowerPoint** (optional, only needed to import PowerPoint files)

### Installations

1. Clone the repository

```
git clone https://github.com/haroisded/easyworship-copy.git
```
1. Install Dependencies

```
cd easyworship-copy && npm install
```
1. Development

```
npm start
```
1. Production Build

```
npm run package
```
The installer is written to `dist/Presenter Setup <version>.exe`.

## Repository Structure

```
/presenter
├── main.js            # Electron main process: windows, display handling, IPC handlers, library save/load, PowerPoint import
├── preload.js         # Exposes the `window.api` IPC bridge to both renderer windows
├── control.html       # Operator window layout and styles (library, schedule, slides, preview/live, dialogs)
├── control.js         # Operator window logic: library, schedule, Go Live, modes, song/settings dialogs, shortcuts
├── output.html        # Render stage markup and styles (background, text, black and logo layers)
├── output.js          # Draws one render state with cross-fades; used by the output window and the preview/live panes
├── lib.js             # Pure helpers (splitSlides, pickDisplay, outputBounds) shared by main, control and tests
├── test.js            # Unit tests for lib.js
├── package.json       # Scripts, Electron/electron-builder dependencies and installer config
├── dist/              # Build output (installer), git-ignored
└── README.md
```
### Architecture Overview

**Main Process (`main.js`)**

- Loads and saves the library, and answers IPC requests from the windows.
- `syncOutput()` is the one place that decides whether the output window exists and where it sits. It runs at startup, after settings are saved, and on every display add, remove or change.
- Relays the live state from the control window to the output window.

**Control Window (`control.html` + `control.js`)**

- The operator UI. A library item is either a song (text split into slides) or a deck (one image per slide), and both become `{ text, bg }` slides.
- `sendLive()` is the only function that changes what the audience sees. It posts the state to the Live pane and sends it to the main process with `api.live`.
- Preview and Live are `<iframe>`s of `output.html` and receive state by `postMessage`.

**Output Window (`output.html` + `output.js`)**

- A frameless, unfocusable window on the output display that receives state over IPC (`state`).
- `render()` scales the stage to the real output size, cross-fades background and text layers only when they change, and auto-sizes the text to fit.

Slide-to-screen flow: `goLive()` → `sendLive()` → `api.live` → main `live` → output `state` → `render()`.

**library.json**

Stored at `%APPDATA%\Presenter\library.json`. Imported deck images are stored in `%APPDATA%\Presenter\decks\<uuid>\`.

| **Key** | **Purpose** |
|---|---|
| songs | Library items: songs `{ id, title, text, bg }` and decks `{ id, title, dir, images }` |
| schedule | Ordered list of item ids for the service |
| settings | Output display, region, fade time, logo, default background and text theme |

### Example IPC Channels

**Renderer → Main (`ipcRenderer.invoke`)**

| **Channel** | **Method** | **Description** |
|---|---|---|
| load | invoke | Return the library and the output status |
| save | invoke | Save the library, then re-sync the output window |
| displays | invoke | List attached displays |
| pick | invoke | Open a file dialog for an image or video, and return a `file://` URL |
| importDeck | invoke | Convert a PowerPoint file to slide images |
| removeDeck | invoke | Delete an imported deck's image folder |

**Live Output**

| **Channel** | **Method** | **Description** |
|---|---|---|
| live | send (control → main) | New live state from the operator |
| state | event (main → output) | Live state to draw |
| status | event (main → control) | Output display configured, its label and stage size |

Example Request:

```
api.importDeck()   // no path: opens a file dialog
```
Example Response:

```
{
  "title": "Sunday Announcements",
  "dir": "C:\\Users\\<you>\\AppData\\Roaming\\Presenter\\decks\\3f2c…",
  "images": ["file:///C:/Users/<you>/AppData/Roaming/Presenter/decks/3f2c…/001.png"]
}
```
Render state sent on `live` / `state`:

```
{
  "text": "Amazing grace, how sweet the sound",
  "bg": { "type": "color", "color": "#000000", "url": "", "fit": "cover" },
  "style": { "font": "Segoe UI", "size": 110, "color": "#ffffff", "outline": 3, "outlineColor": "#000000", "shadow": true, "align": "center", "valign": "middle" },
  "logo": "",
  "mode": "normal",
  "ms": 500,
  "stage": { "w": 1920, "h": 1080 }
}
```
### Testing

Tests cover the pure helpers in `lib.js` (slide splitting, display picking, output bounds) using `node:assert`. They print `ok` on success.

```
npm test
```
### Versioning & Changelog

Keep a `CHANGELOG.md` file documenting updates (not created yet).

Use **Semantic Versioning (MAJOR.MINOR.PATCH)**, for example `0.1.1` → `0.2.0` for new features. The version in `package.json` is also used in the installer file name.

## Contributing

We welcome contributions from developers who want to improve **Presenter**!

Follow these steps to contribute effectively:

- **Fork the Repository**
  - Click the *Fork* button on GitHub to create your own copy of the project.
- **Clone Your Fork**
  - Run:
 ```
git clone https://github.com/<your-username>/easyworship-copy.git
```
- **Create a Feature Branch**
  - Keep your changes organized:
 ```
git checkout -b feat/your-feature-name
```
- **Set Up the Environment**
  - Follow the Quick Start instructions in this README to install dependencies and run the app.
- **Use Clear Commit Messages**
  - Follow the conventional commit style:
    - `feat:` – new feature
    - `fix:` – bug fix
    - `docs:` – documentation update
    - `refactor:` – code restructuring
- **Write or Update Tests**
  - Add assertions to `test.js` for new pure helpers in `lib.js`.
  - Run:
 ```
npm test
```
- **Document Your Changes**
  - Update `README.md` or `CHANGELOG.md` if needed.
- **Submit a Pull Request (PR)**
  - Push your branch and open a PR with:
    - A short, clear description of your changes.
    - Any related issue numbers (for example, “Closes #12”).
    - Screenshots of the control or output window (if applicable).
- **Participate in Code Review**
  - Respond to feedback, make improvements, and help maintain project quality.

### Code of Conduct

To maintain a positive and inclusive community, all contributors are expected to:

- Be respectful, kind, and patient when interacting with others.
- Welcome feedback and engage in constructive discussions.
- Avoid discriminatory or offensive language.
- Focus on collaboration and problem-solving rather than criticism.
- Credit other contributors where due.
- Report any violations or concerns to the maintainers privately.

Let’s work together to make **Presenter** a project where everyone feels valued and supported. 💙

## Deployment

| **Component** | **Platform** | **Notes** |
|---|---|---|
| Desktop app | Windows (NSIS installer) | `npm run package` → `dist/Presenter Setup <version>.exe` |
| Installer | electron-builder | Assisted setup wizard; the user can choose the install folder |
| User data | Local `%APPDATA%\Presenter` | `library.json` + `decks/`, kept across reinstalls |

### License

This project is unlicensed. All rights reserved by the author.

### The GitHub Repository

You can clone the GitHub repo, edit and build the app from it: [easyworship-copy repo.](https://github.com/haroisded/easyworship-copy)

### **Developer Checklist**

Think of this checklist as your *final review* before sharing a new build:

**1. Output Display Is Working**

- Connect a second monitor or projector and check that the output window opens on it.
- Unplug and replug it; the output should close and come back on its own.
- Set a custom region and check the output lands exactly on it.

**2. Library & PowerPoint Import Work**

- Create, edit and delete a song; check slides split on blank lines.
- Import a PowerPoint file and confirm every visible slide appears.
- Restart the app and make sure the library and schedule are still there.

**3. Live Controls Are Responsive**

- Test Go Live, Black, Clear and Logo, by button and by keyboard (`Enter`, `Space`, arrows, `B`, `C`, `L`).
- Check that fades look smooth and nothing flickers between modes.

**4. Tests Pass**

- Run `npm test` and make sure it prints `ok`.
- Fix any failed tests before merging branches.

**5. Installer Builds and Installs**

- Run `npm run package` and install the generated setup file on a clean machine.
- Bump the version in `package.json` for every release.

**6. Documentation Files Are Complete**

- Ensure your **README** and **CHANGELOG** files are up to date.
- Add setup steps and update notes.

Run through your README’s **Quick Start** section as if you’re a new user.

If you can set up the project in less than 10 minutes, your documentation is clear enough.
