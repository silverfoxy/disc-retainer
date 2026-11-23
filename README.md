# Disc Retainer

Hosted app: <https://discretainer.imsilverfoxy.com>.

The original <https://disc-retainer.babak9326.workers.dev> address remains available.
Saved notebooks belong to each browser origin; export JSON from the old address
and import it on the custom domain to move your observations.

Visualize and save gate locations for disc detainer locks.

An interactive 3D notebook with true and false gates, ordered picking replay,
one-handed touch controls, keyboard shortcuts, and voice commands. Gate readings
use **8 marks per turn** (45° per mark). Geometry is illustrative; observations
and midpoint alignment do not establish that a physical lock is open.

## Features

- Record true-gate ranges and multiple false gates on each disc.
- Adjust disc 1 by counter-rotating the tensioner, or keep its assumed 0-mark stop.
- Replay discs in recorded order, seat the sidebar, then turn the core.
- Save separate named lock notebooks in browser storage.
- Export/import full JSON notebooks, or export a simple ordered CSV gate table.
- Minimize controls to switch between manual and voice input.

## Hosting options

Run commands from this directory (the root of the standalone `disc-retainer`
repository). If cloning the repository, GitHub access is required while it is private.

| Option | Voice recognition | Requirements |
| --- | --- | --- |
| Docker, web image | Manual/typed input only | Docker Engine/Desktop |
| Docker Compose, speech image | Local CPU Whisper `base.en` | Docker + Compose; initial model download |
| Cloudflare Workers | Workers AI Whisper large v3 turbo | Node.js 22+, a Cloudflare account |

Saved observations always live in the browser, not in a container or Cloudflare.
Export JSON before changing hostname, port, browser or device.

### Docker: manual input only

Install [Docker](https://docs.docker.com/get-started/get-docker/) and start its daemon.
Stop any existing app using port 8770, then:

```sh
docker build --target web -t disc-retainer:web .
docker run -d --name disc-retainer --init -p 127.0.0.1:8770:8770 disc-retainer:web
```

Open <http://localhost:8770>. The model, manual/typed commands, saved notebooks,
JSON import/export and CSV export work. This lightweight image does not include
Python or speech models; use the Compose option below for microphone commands.

```sh
docker logs -f disc-retainer
docker stop disc-retainer
docker rm disc-retainer
```

### Docker Compose: local voice recognition

The included `compose.yaml` builds the `speech` image and keeps the Whisper model
in a named `speech-models` volume. Build and download the model once:

```sh
docker compose build
docker compose run --rm --no-deps disc-retainer /opt/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8', download_root='/models')"
docker compose up -d
```

Open <http://localhost:8770>, press **Start listening**, and allow microphone access.
Your browser captures the microphone and sends recordings to the local container;
no audio-device passthrough, privileged container, or PulseAudio socket is needed.
The container's native Linux input list is empty; use the browser microphone.
The first build/model download needs Internet access. After that, the local speech
worker loads its cached model without downloading it during recognition.

```sh
docker compose logs -f
docker compose down
```

`down` preserves the model volume. `down --volumes` also deletes the downloaded
model; it does not delete browser notebooks. After pulling updates, use
`docker compose up -d --build` to rebuild and replace the running container.
Do not run this Compose service and the web-only container on port 8770 together.

Both Docker options publish only to your computer's loopback interface. Browsers
allow microphone capture and screen wake lock on localhost, but generally not on
plain HTTP at a LAN IP. For phone access, use the HTTPS Cloudflare deployment below.
Docker is intended for one local user; the local recognizer processes one utterance
at a time and does not provide the hosted Worker's shared usage quotas.

The local server defaults to `127.0.0.1`; Docker sets `DISC_RETAINER_HOST=0.0.0.0`
inside the container so port publishing works. `DISC_RETAINER_PORT` defaults to
8770 (`DISC_STUDIO_PORT` is still accepted). Additional exact HTTP Host values can
be configured as a comma-separated `DISC_RETAINER_ALLOWED_HOSTS`; cross-origin
requests remain rejected. Default allowed Hosts are `localhost:8770` and
`127.0.0.1:8770`.

## Local development

Run `node server.mjs` and open <http://127.0.0.1:8770>.
The model, manual controls, notebook storage and exports work without Python.
Local voice recognition additionally requires the local Whisper setup described
below. The browser requests microphone access only after Start listening is selected.
The same button becomes Stop listening; microphone choices refresh automatically.
On phones, a sticky workspace keeps the model, listening button, speech status,
playback controls and recorded pick order together while input panels scroll below.
False gates remain separate ordered steps. Longer model explanations expand under
Model details. The order box expands to include every step. Applied commands
highlight their true/false gate item in green; unmatched speech shows Not applied
without changing observations. Repeated commands highlight the existing item and
report Already recorded. When a long list outgrows the viewport, the workspace
scrolls with the page so controls remain reachable.
The model automatically fills its canvas, with a closer starting angle on phones.
While visible, the page requests a screen wake lock and shows its status. It retries
on return or a tap if the browser releases it; unsupported browsers and battery
saving settings may prevent keeping the display awake.

## Controls

Drag the model to rotate and scroll to zoom. Choose a disc and enter Start/End
marks, then Save gate. Turn on **False gate** to record a smaller, shallower notch.
Notch widths follow the entered range; single-point readings use a default width.
Reset disc clears that disc's observations; Undo restores them.

Click **Keyboard** to focus manual input. **F/T** selects false/true, **Space**
moves Disc → Start → End → Save, arrows adjust the selected value, and **Enter**
saves. Normal typing in lock names and transcripts is preserved. Vimium users
can press **i** for insert mode or exclude this site's URL in Vimium settings.

Voice examples:

- “disc four gate from two to two and a half”
- “disc four false gate at three”
- “disc one gate from five to five point five”
- “reset disc four” / “reset all discs” (also “reset all the discs, please”)
- “clear false gates disc four”

Speak while the indicator says Listening; pause after a complete command and
wait for transcription to finish before speaking again.

## Saved observations

Expand **Lock notebooks**, enter a name, and Save lock. Further changes to a named
lock save automatically in this browser. New lock preserves the current notebook;
Open selected loads a saved one. Export JSON creates a portable backup; importing
creates another notebook without replacing a saved lock with the same name.

**Export gate table** produces a CSV with Step, Disc, True gate, False gate and
Action. Each current true/false observation has a separate numbered step, in first
entry order. Range edits keep their place; resets and clears remove old steps.
Missing true gates are listed last without a step number. An assumed disc-1 stop
is clearly marked. Use JSON, rather than CSV, to restore a complete notebook.

Browser storage belongs to a particular browser and site address. Export JSON to
move observations between the local app and the hosted site, or between devices.

## Cloudflare Workers deployment

Install [Node.js 22 or newer](https://nodejs.org/) and create a
[Cloudflare account](https://developers.cloudflare.com/workers/get-started/guide/).
Use the portable template so your deployment does not claim this project's domain:

```sh
npm ci
npm test
cp wrangler.example.jsonc wrangler.local.jsonc
npx wrangler login
npx wrangler whoami
```

Edit `wrangler.local.jsonc` and set `name` to your Worker name, for example
`my-disc-retainer`. Keep its `main`, static asset configuration, `AI` binding,
`SPEECH_BUDGET` binding/migration, rate limit bindings, and `SPEECH_ENABLED` setting.
If your login lists several accounts, select the intended ID from `whoami`:

```sh
export CLOUDFLARE_ACCOUNT_ID=your_account_id
npm run build
npx wrangler deploy --config wrangler.local.jsonc
```

Wrangler prints your HTTPS `https://<worker-name>.<account-subdomain>.workers.dev`
address. If this is your first Worker, complete Cloudflare's workers.dev subdomain
setup when prompted. The deployment provisions the static assets, Workers AI
binding, and a SQLite-backed Durable Object for the shared speech budget. No Python,
Docker, model download, or client-side API key is needed. Open the URL, allow
microphone access, and test a command such as “disc two gate from two to three”.

`wrangler.local.jsonc` is ignored by Git. Use it for subsequent deployments as well.
`npm run deploy` uses `wrangler.jsonc`, which contains this project's production
custom domain; use `npx wrangler deploy --config wrangler.local.jsonc` for your own
installation. Only the explicit browser assets in `scripts/build.mjs` are public.

For your own custom domain, ensure its DNS zone is active in the same Cloudflare
account. Add a `routes` field to **your** local config, then redeploy:

```json
"routes": [{ "pattern": "locks.example.com", "custom_domain": true }]
```

Cloudflare provisions DNS and HTTPS for the hostname. The original workers.dev
URL stays available because `workers_dev` is true. Export/import notebooks to move
between the two addresses. See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Verify the deployment:

```sh
curl https://your-worker.your-subdomain.workers.dev/api/health
```

Expect `speech: "cloudflare-whisper"`. To test the actual service, use **Start
listening** on the website: the health check confirms the binding exists, not that
inference succeeded. If speech fails, check the account's Workers AI allowance,
billing/availability, microphone permission, and the on-page error message.

The hosted website records short microphone utterances in the browser and sends
them over HTTPS to Workers AI (`@cf/openai/whisper-large-v3-turbo`). The app does
not store audio or transcripts on the server; notebooks remain in browser storage.
Each hosted inference includes a fixed `initial_prompt` with lock-picking vocabulary
and examples of gate ranges, false gates, reset-all, reset-disc and clear commands.
This hints transcription spelling and phrasing; it does not constrain Whisper to
valid commands or replace the strict command parser. Prior transcripts and saved
notebook contents are not included in the prompt.
The speech endpoint validates mono 16 kHz PCM16 WAV audio, caps recordings at
16 seconds, checks browser origin and a session cookie/token, and limits requests
per IP and per Cloudflare location. These are abuse controls for a public demo,
not user authentication. Workers AI usage counts against your account allowance.
A single SQLite-backed Durable Object also enforces a persistent, global allowance:
30 minutes / 300 requests per UTC day and 5 hours / 3,000 requests per UTC calendar
month, whichever is reached first. Reservations round each utterance up to a whole
second and happen atomically before inference; failed inferences are not refunded.
Missing/unavailable budget protection fails closed, and the microphone stops on
quota or service errors. Manual input remains available. Redeployments preserve
usage; do not rename/delete the budget object or its namespace to reset counters.

At the published Whisper price of $0.000513/audio minute, the monthly audio cap
represents about $0.154 of model usage before free allowances. This is an audio
usage cap for this app, not an account-wide dollar cap: Worker requests, Durable
Objects, other apps and future price changes are separate. See Cloudflare's
[model pricing](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/).
Set `SPEECH_ENABLED` to `"false"` in your deployment config and redeploy for an immediate
server-side speech kill switch. The default is enabled.

For local Workers development with your copied config, use
`npm run build` then `npx wrangler dev --config wrangler.local.jsonc`.
This exercises the Worker runtime; it does not install the local Python recognizer.
Microphone capture on a phone requires HTTPS; use the deployed `workers.dev` URL for device testing. Microphone
permission and audio input must be available to the phone's browser. The direct
Linux microphone option is available only through the local Node server.

## Optional local Whisper setup

For a native installation without Docker, use Python 3.12 or newer:

```sh
python3.12 -m venv .venv-speech
.venv-speech/bin/pip install -r requirements-speech.lock.txt
.venv-speech/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8', download_root='.cache/speech')"
npm start
```

The local recognizer loads the downloaded model without network access and keeps
audio in memory. `DISC_RETAINER_PYTHON` and `DISC_RETAINER_MODEL_CACHE` can override
its Python executable and model cache. Existing parent-directory installations
are supported for this project's original local workspace. Direct Linux inputs
also require FFmpeg and PulseAudio/PipeWire (`pactl`).

## Verification

`npm test` checks the observation model, geometry/clearances, replay sequence,
voice grammar and audio segmentation, notebook CSV export, and Worker API.
`npm run build` creates `.public/`; `npx wrangler deploy --dry-run` validates the
Worker bundle and bindings without publishing. The GitHub Actions Docker job builds
both image targets, checks speech dependencies, and verifies published ports and
HTTP Host protection.

Optional browser checks (`browser-*-check.mjs`) use a dedicated Chrome DevTools
instance on port 9223 and the local app on port 8770. They create test tabs and
exercise touch/keyboard entry, saved locks, exports/imports, picking replay and
simulated microphone transcription. They do not verify physical microphone
recognition or real phone/browser compatibility.
