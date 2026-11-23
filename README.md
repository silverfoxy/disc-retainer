# Disc Retainer

**Visualize and save gate locations for disc detainer locks.**

Use it at **[discretainer.imsilverfoxy.com](https://discretainer.imsilverfoxy.com)**.

## Features

- Interactive 3D discs, gates, sidebar and picking tool. Drag to rotate; scroll to zoom.
- Record a true-gate range and multiple false gates per disc using voice, touch or keyboard.
- Keep observations in entry order and replay the picking sequence, including disc 1 counter-rotation and sidebar movement.
- Save named lock notebooks, import/export JSON backups, and export an ordered CSV gate table with false gates as separate steps.
- Mobile controls, listening/transcribing feedback and screen wake lock where supported.

Readings use **8 marks per full turn** (45° per mark). Disc numbers start at the top.
Disc 1 defaults to the tensioned 0-mark stop until you enter its gate. The model
illustrates your observations; it does not detect gates or verify a physical unlock.

## Voice and typed commands

Press **Start listening**, allow microphone access, and speak one command at a time.
Wait for **Listening** after transcription before speaking again. You can also edit
and apply the transcript manually. Digits, number words and fractions such as
“two and a half” are accepted.

| Command example | Result |
| --- | --- |
| `disc four gate from two to two and a half` | Set disc 4's true-gate range to 2–2.5 marks |
| `disc 4 gate at 3` | Set a single true-gate reading |
| `disc 4 false gate from 3 to 3.5` | Add a false-gate range |
| `disc 4 false gate at 3` | Add a single false-gate reading |
| `reset disc 4` | Clear that disc's true and false gates |
| `clear false gates disc 4` | Clear only its false gates |
| `reset all discs` | Clear every disc's observations |

Manual input: choose a disc, enter Start/End marks, select **True gate** or
**False gate**, then save. **Undo** reverses an observation change.
Click **Keyboard** to focus the controls: **F/T** selects false/true, **Space**
advances fields, **arrow keys** adjust values, and **Enter** saves. If Vimium
captures shortcuts, use its insert mode (`i`) or exclude this site.

Expand **Lock notebooks** to name and save a lock; subsequent changes save
automatically. Notebooks stay in that browser and site address. Use **Export JSON**
and import to move between devices or deployments; CSV is a reference table.

## Self-hosting

Clone this repository and run the following commands from its root directory.

### Docker with local voice recognition

Requires Docker with Compose. Build and download the Whisper model once:

```sh
docker compose build
docker compose run --rm --no-deps disc-retainer /opt/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8', download_root='/models')"
docker compose up -d
```

Open **http://localhost:8770**. The browser supplies microphone audio; recognition
runs locally on the CPU using Whisper `base.en`. The model stays in a Docker volume.

- Update: `docker compose up -d --build`
- Logs: `docker compose logs -f`
- Stop: `docker compose down` (preserves the model)

For a smaller image without voice recognition:

```sh
docker build --target web -t disc-retainer:web .
docker run --rm --init -p 127.0.0.1:8770:8770 disc-retainer:web
```

Run only one option on port 8770. Docker publishes to localhost; phone microphone
access requires HTTPS, so use the Cloudflare option for mobile access.

### Cloudflare Workers with hosted voice recognition

Requires Node.js 22+ and a Cloudflare account with Workers AI access.
Copy the portable configuration, which omits this project's production domain:

```sh
npm ci
cp wrangler.example.jsonc wrangler.local.jsonc
npx wrangler login
```

Set `name` in `wrangler.local.jsonc` to your Worker name, then deploy:

```sh
npm run build
npx wrangler deploy --config wrangler.local.jsonc
```

If you have multiple accounts, run `npx wrangler whoami` and set
`CLOUDFLARE_ACCOUNT_ID` to the intended account ID before deploying. Always use
`--config wrangler.local.jsonc` for your own installation.
Wrangler prints your HTTPS `workers.dev` URL. For a custom domain in your
Cloudflare account, add this to your local config and redeploy:

```json
"routes": [{ "pattern": "locks.example.com", "custom_domain": true }]
```

Hosted voice sends audio to Workers AI Whisper large v3 turbo. The app does not
persist audio or transcripts on the server. Shared speech limits default to
**30 minutes / 300 requests per UTC day** and **5 hours / 3,000 requests per UTC
month**, whichever limit is reached first. Cloudflare charges may apply; these
limits cover this app's speech usage, not your entire account. Set
`SPEECH_ENABLED` to `"false"` and redeploy to disable hosted speech.

### Local development

With Node.js 22+, `npm start` serves the manual-input app at
http://localhost:8770. For voice, use Docker above. Run `npm ci`, `npm test` and
`npm run build` to check the code and build the Worker assets.
