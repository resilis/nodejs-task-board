# Node.js task board

A small, editable task board built with Node.js and browser-native HTML, CSS, and JavaScript. It demonstrates a simple app that can run as a Node service or in a container.

**Sample version:** 1.0.0  
**Source:** [resilis/nodejs-task-board](https://github.com/resilis/nodejs-task-board)  
**Fork this sample:** [Create a GitHub fork](https://github.com/resilis/nodejs-task-board/fork)

## What it does

- Create, rename, move, and delete tasks in To do, Doing, and Done.
- Keep at most 100 tasks. Task titles contain 1–120 trimmed characters.
- Start with three sample tasks to make the board useful at first launch.
- Keep task data in memory. All tasks reset when the app restarts.
- Set DEMO_READ_ONLY=true to make a shared demo view-only. The setting rejects every non-read HTTP method on every path, and the interface disables its write controls. It defaults to false for your own deployment.
- Report readiness at /ready.

This sample has no sign-in. Do not use it for private or important task data.

## Run locally

Use Node.js 22.15 or newer. Copy .env.example to .env, then start the app:

    cp .env.example .env
    npm start

Open http://localhost:3000. The server binds to 0.0.0.0 and uses PORT, which defaults to 3000.

Run the HTTP contract and restart-reset checks with:

    npm test

## Run with Docker

Build and run the sample from the repository root:

    docker build -t resilis-nodejs-task-board .
    docker run --rm --name resilis-nodejs-task-board -p 3000:3000 -e PORT=3000 -e DEMO_READ_ONLY=false resilis-nodejs-task-board

Open http://localhost:3000. The container runs as the unprivileged node user. Its in-memory tasks reset when the container restarts.

## Deploy on Resilis

Use your own fork as the source for a new app. Connect the repository and deploy its main branch with the Node build option or build from its Dockerfile. Keep the app's configured port aligned with PORT, then check that /ready responds with a ready status.

Your deployment stays editable by default. Set DEMO_READ_ONLY=true only when you want a shared, view-only demo. Verify the current Resilis setup flow and available build options in your workspace before relying on a specific setting or screen.

## API

- GET /api/tasks lists tasks.
- POST /api/tasks creates a task from {"title":"..."}.
- PATCH /api/tasks/:id changes title, status, or both.
- DELETE /api/tasks/:id deletes a task.
- GET /api/config reports the read-only setting and task limit.
- GET /ready reports app readiness and the in-memory storage type.

Write requests use JSON. Invalid titles or statuses return 400; an unknown task returns 404; a full board returns 409; a body above 4 KB returns 413.

## Project files

- src/server.js serves the UI and validates the HTTP API.
- src/memory-store.js owns the in-memory task state and sample tasks.
- public/ contains the static interface.
- tests/http.test.js checks HTTP behavior through a running server.

## License

MIT. See LICENSE.
