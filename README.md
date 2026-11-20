# wisedayZ — Windows Desktop Smart Scheduler

wisedayZ is a local-first productivity and scheduling application packaged as a Windows desktop app with Electron. It does **not** call OpenAI or any other paid AI service. Scheduling, task handling, wake-up preferences, routines, focus tools and reports use the existing local JavaScript logic.

## Build the Windows installer

### Easiest method on Windows

On a Windows 10/11 x64 computer, install Node.js 22.12 or newer, extract this project, then double-click `BUILD-WINDOWS.bat`. It installs dependencies, runs the tests and builds the installer. The generated file is placed in `dist\wisedayZ-Setup-1.0.0.exe`.

### Manual method

1. Extract this project folder.
2. Open PowerShell in the `ai-smart-scheduler` folder.
3. Install dependencies:

   ```powershell
   npm install
   ```

4. Run the desktop app in development mode:

   ```powershell
   npm run start:desktop
   ```

5. Build the Windows installer:

   ```powershell
   npm run dist:win
   ```

6. Find the installer in `dist\wisedayZ-Setup-1.0.0.exe`. Run it to install wisedayZ.

For a portable executable instead of an installer:

```powershell
npm run dist:win:portable
```

## What the desktop wrapper does

- Opens wisedayZ in a standalone Windows window (not a browser tab).
- Starts the frontend and local API automatically on loopback-only local ports (the frontend origin stays fixed so browser storage persists; the API port is selected locally).
- Stops those local servers when the app exits.
- Stores the local account/workspace database in Electron's per-user application data folder.
- Keeps the app's local browser storage and data between launches.
- Does not require Python, a separate terminal, a hosted backend, an OpenAI key or a paid AI subscription for local use.
- Uses a restricted local API origin and a sandboxed renderer with Node integration disabled.

## Data and sync notes

- Your desktop app data is stored on this Windows user profile. It is not automatically shared with Chrome, Edge, another PC or your phone.
- The local desktop API uses a JSON database file in the app's user-data folder. This is suitable for a personal local desktop build, not a multi-user production server.
- Cloud sync across devices still requires a separately deployed backend and PostgreSQL configuration. This desktop package deliberately does not configure a remote database.
- Export a JSON backup regularly from Settings. Do not uninstall/clear application data until you have a backup.

## Build using GitHub Actions (without building locally)

The included `.github/workflows/build-windows.yml` can build the Windows installer on a GitHub-hosted Windows runner. Push this project to a GitHub repository, then open **Actions → Build wisedayZ Windows installer → Run workflow**. After it completes, download the `wisedayZ-Windows-Installer` artifact from the workflow run. The artifact is temporary (30 days); publish it as a GitHub Release when you are ready to distribute it.

## Tests

```powershell
npm test
```

The test suite covers scheduling, notifications, recurring tasks, dependencies, API authentication, PostgreSQL migration configuration, cookie security, UI regressions and checks that no external AI provider is called.

## Important

The Windows installer is generated on the Windows machine by `electron-builder`; this source package does not contain a prebuilt `.exe`. Code signing is not configured, so Windows SmartScreen may show an unknown-publisher warning until you sign the installer with a code-signing certificate.