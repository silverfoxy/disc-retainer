# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV DISC_RETAINER_HOST=0.0.0.0
COPY index.html style.css app.mjs scene3d.mjs model.mjs protocol.mjs voice-commands.mjs local-speech.mjs speech-capture.mjs server.mjs speech-relay.mjs native-microphone.mjs ./
USER node
EXPOSE 8770
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:8770/');if(!r.ok)process.exit(1)"]
CMD ["node", "server.mjs"]

# Optional CPU-only local Whisper. Models live in a persistent volume, not the image.
FROM python:3.12-slim-bookworm AS speech
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY requirements-speech.lock.txt ./
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements-speech.lock.txt
COPY --from=web /app /app
COPY speech_worker.py ./
RUN useradd --uid 10001 --create-home app && mkdir /models && chown app:app /models
ENV DISC_RETAINER_HOST=0.0.0.0 DISC_RETAINER_PYTHON=/opt/venv/bin/python DISC_RETAINER_MODEL_CACHE=/models PYTHONDONTWRITEBYTECODE=1
USER app
EXPOSE 8770
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:8770/');if(!r.ok)process.exit(1)"]
CMD ["node", "server.mjs"]
