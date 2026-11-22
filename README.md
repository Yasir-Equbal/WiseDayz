# **wisedayZ — Smart Scheduler**



**Make Every Day Count.**



wisedayZ is a local-first smart scheduler and Electron desktop application designed for day planning, routine management, focus sessions, habit tracking, and productivity insights.



I started building wisedayZ to make daily planning more practical. A to-do list can tell me what I need to do, but it does not always help me decide when to do it, how to handle unfinished work, or whether I am using my time well. This project brings those pieces together in one desktop app.



The application stores its main data locally in the browser using `localStorage` with the key `daywise.v1`. When signed in, it can optionally sync with a workspace API. The desktop version runs through Electron.



**---**



## **Features**



### **Daily, weekly and monthly planning**

- View and manage tasks across day, week, and calendar views.

- Organise tasks and track their status.

- Detect scheduling conflicts.



### **Routines and wake-up check-ins**

- Switch between routines such as **College day**, **Weekend reset**, and **Exam preparation**.

- Confirm actual wake-up times.

- Review conflict-aware schedule proposals before applying changes.



### **Focus Studio**

- Pomodoro mode.

- Stopwatch mode.

- Countdown timer mode.

- Optionally link focus sessions to tasks and log completed sessions.



### **Habits, insights and activity history**

- Track daily habits.

- View study hours across **Daily**, **Weekly**, **Monthly**, and **Yearly** periods.

- Review activity history.

- Export records in CSV and JSON formats.



### **Appearance**

- Switch between Night Mode and Light Mode from the top bar or Settings.

- Save the selected theme between sessions.



### **Desktop and API support**

- Run as a Windows desktop application using Electron.

- Build the Windows installer with `electron-builder`.

- Support PostgreSQL-backed cloud sync through `PostgresStore` in `postgres-store.js`, when the API and database are configured.
- Check for new Windows desktop releases from GitHub and download the installer from the Settings screen.



**---**



## **Desktop update system**

The Electron desktop app includes a GitHub Releases update checker.

- Checks for a newer stable release automatically shortly after the desktop app starts.
- Lets users manually select **Settings → Software updates → Check for updates**.
- Shows the installed version and whether a newer version is available.
- Downloads the matching Windows `.exe` installer from the latest stable GitHub Release.
- After the download, launches the installer and closes wisedayZ so the user can complete the update.

**Important notes**

- Update checking and installer installation are currently intended for the packaged Windows desktop app.
- An internet connection is required to contact the GitHub Releases API and download an installer.
- The GitHub Release must include a Windows installer asset named like `wisedayZ-Setup-1.1.2.exe`.
- The updater does not silently install updates. The Windows installer opens and the user completes the installation.
- Running the app from a development environment may not behave like an installed production build.

The update bridge is exposed to the renderer through `preload.js` and handled in Electron's `main.js`. The renderer does not receive direct Node.js or Electron access.

---

## **Version history**



This changelog records the releases and fixes made after the initial `v1.0.1` release.



| Version | Update | Details |

|---|---|---|

| **v1.0.0** | Initial release | First public packaged Windows desktop release. |

| **v1.0.1** | Focus Studio improvements | Updated focus timer behaviour and session tracking. |

| **v1.0.2** | Missing action handlers | Fixed unresponsive buttons and missing `handleAction` cases across Habits, Planning Helper, Settings, Profile, Alarm, Notifications, data exports, reports, and schedule preparation. |

| **v1.0.3** | Focus timer reset and duration persistence | Fixed countdowns and resets using hardcoded 25- and 15-minute values. Focus, break, and timer durations now use `focusMinutes`, `breakMinutes`, and `timerMinutes` in `state.preferences`, including backup migration. |

| **v1.0.4** | Header, chat and modal event wiring | Fixed the menu toggle and quick search, added Enter-key submission for the chat input, and prevented clicks inside a modal from triggering backdrop-close behaviour. |

| **v1.0.5** | Insights study hours and period switcher | Added `studyMinutesForDate()` and Daily, Weekly, Monthly, and Yearly views with a date picker in Insights. Study time from Study tasks and focus sessions can be reviewed over time. |

| **v1.1.0** | One-click Night / Light Mode | Added the `#theme-toggle` control (`☾` / `☀`, `data-action="toggle-theme"`) in the top bar and Settings. Theme changes use `toggleTheme()`, `applyTheme()`, and persist through `state.preferences.theme`. |

| **v1.1.1** | Dark Mode notification contrast | Improved read and unread notification readability in Night Mode using distinct dark backgrounds, a teal left accent border, and higher-contrast text for `.history-row` and `.history-row.notification-unread`. |
| **v1.1.2** | Desktop update system | Added automatic update checks on startup, a manual Check for Updates action, version comparison, update notifications, installer download, and installer launch through the Electron main-process/preload bridge. |



### **Current documented release version: `v1.1.1`**

The desktop update-checking integration has been added to the project files. It becomes available to users only after a new build containing these changes is published as a GitHub Release.



For downloadable installers and release notes, visit the [GitHub Releases page](https://github.com/Yasir-Equbal/WiseDayz/releases).



**---**



## **Tech stack and what I am learning**



wisedayZ is also a practical learning project. I am using it to understand how a real application is built, debugged, packaged, and maintained over multiple versions.



| Technology / area | Where it is used | What I am learning |

|---|---|---|

| **HTML** | Application structure and interface elements | Structuring screens and interactive components |

| **CSS** | Layout, themes, and visual styling | Responsive layouts, visual hierarchy, and theme design |

| **JavaScript** | Task logic, scheduling interactions, timers, event handlers, and state | DOM manipulation, functions, event handling, state management, validation, and debugging |

| **localStorage** | Local persistence using `daywise.v1` | Saving application state, reading stored data, and handling preference/data migrations |

| **Electron** | Windows desktop application | Desktop app architecture and connecting web technologies to a desktop runtime |

| **Node.js and npm** | Runtime tooling, scripts, and dependencies | Package management and running development/build commands |

| **PostgreSQL and API integration** | Optional workspace sync through the API and `PostgresStore` | Database-backed persistence and client/server communication |

| **electron-builder** | Windows installer generation | Packaging, build configuration, and release artefacts |

| **Git and GitHub** | Source control and release distribution | Commits, branches, version tags, pushing changes, and publishing releases |

| **Testing and debugging** | Regression checks and bug fixes | Reproducing issues, reading logs, validating fixes, and avoiding regressions |



The development process is teaching me to work through a complete software cycle:



1. Identify a problem or missing behaviour.

2. Find the relevant part of the application.

3. Implement a focused change.

4. Test the feature and related flows.

5. Debug issues and fix regressions.

6. Build the desktop application.

7. Publish a version and document its changes.



**---**



## **Setup and usage**



### **Requirements**

- Node.js and npm.

- Git, if you want to clone the repository.

- Windows for the current packaged desktop release.



### **1. Clone the repository**



```bash

git clone https://github.com/Yasir-Equbal/WiseDayz.git

cd WiseDayz

```



### **2. Install dependencies**



```bash

npm install

```



### **3. Run the test suite**



```bash

npm test

```



### **4. Start the desktop application**



```bash

npm run start:desktop

```



This starts wisedayZ in an Electron desktop window.



### **5. Build the Windows installer**



```bash

npm run dist:win

```



The generated installer is placed in the `dist` directory. Its filename includes the version configured in `package.json`, for example:



```text

dist/wisedayZ-Setup-<version>.exe

```



On Windows, the project can also be built using:



```text

BUILD-WINDOWS.bat

```



**---**



## **How I prepare a new release**



1. Make the code changes and verify the affected features.

2. Update the `version` value in `package.json`.

3. Run `npm test`.

4. Launch and manually test the desktop app with `npm run start:desktop`.

5. Build the Windows installer with `npm run dist:win` or `BUILD-WINDOWS.bat`.

6. Install and test the generated `.exe`.

7. Commit and push the source changes to GitHub.

8. Create a GitHub Release with a matching version tag, such as `v1.1.3`.

9. Attach the installer from the `dist` folder and publish the release.
10. Ensure the release tag matches the `package.json` version and the installer asset follows the expected filename pattern.

For electron-builder GitHub publishing, configure a GitHub token in the `GH_TOKEN` environment variable, then use:

```bash
npm run dist:win:publish
```

Do not commit the token or place it in source code. The normal local build remains:

```bash
npm run dist:win
```
10. Ensure the release tag matches the `package.json` version and the installer asset follows the expected filename pattern.

For electron-builder GitHub publishing, configure a GitHub token in the `GH_TOKEN` environment variable, then use:

```bash
npm run dist:win:publish
```

Do not commit the token or place it in source code. The normal local build remains:

```bash
npm run dist:win
```



Older releases should remain available so users can see the project's progress and download a previous version if needed.



**---**



## **Data and architecture notes**



- The main local application state is stored in `localStorage` under `daywise.v1`.

- Optional workspace synchronisation uses an API when the user is signed in and the service is configured.

- The PostgreSQL storage implementation is identified in the project as `PostgresStore` (`postgres-store.js`).

- Electron provides the desktop runtime; `main.js` is part of the desktop application setup.
- `preload.js` exposes a narrow, context-isolated update API to the renderer; `main.js` checks GitHub Releases, downloads the Windows installer, and launches it.
- `preload.js` exposes a narrow, context-isolated update API to the renderer; `main.js` checks GitHub Releases, downloads the Windows installer, and launches it.



Local storage and optional API synchronisation are different parts of the data flow. Running the desktop app locally does not, by itself, mean a production cloud API or PostgreSQL service is deployed.



**---**



## **Current scope**



wisedayZ is an actively developed project. The current focus is improving the reliability of planning, focus tools, insights, themes, and user interactions.



The README describes the features and fixes recorded in the project changelog. A listed feature or a successful installer build should not be treated as proof that every possible workflow has been tested on every device. Please report reproducible issues with the steps and error details.



**---**



## **Repository**



- **Source code:** [GitHub repository](https://github.com/Yasir-Equbal/WiseDayz)

- **Downloads and release notes:** [GitHub Releases](https://github.com/Yasir-Equbal/WiseDayz/releases)



**---**



## **Why I am building it**



I am building wisedayZ while learning software development through a real product. Each version gives me a chance to work on application logic, event handling, state persistence, debugging, testing, desktop packaging, and release management.



The aim is to understand the full process: taking an everyday problem, turning it into software, finding what breaks, fixing it, and delivering improvements in a way users can actually install.



**wisedayZ — Make Every Day Count.**
