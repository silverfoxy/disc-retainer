"""Persistent local-only speech worker. Audio stays in memory, never on disk."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import time
import wave
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
LEGACY_CACHE = ROOT.parent / 'data/model-cache/speech'
MODEL_CACHE = Path(os.environ.get('DISC_RETAINER_MODEL_CACHE', str(LEGACY_CACHE if LEGACY_CACHE.exists() else ROOT / '.cache/speech')))
MODEL = None

def prepare():
    global MODEL
    if MODEL is None:
        MODEL = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=4,
                             download_root=str(MODEL_CACHE), local_files_only=True)
    return {'ready': True, 'engine': 'local-whisper', 'model': 'base.en'}

def process(payload):
    prepare()
    if payload.get('command') == 'ready':
        return prepare()
    raw = base64.b64decode(payload['audio'], validate=True)
    if len(raw) > 520000:
        raise ValueError('Audio must be under 16 seconds.')
    with wave.open(io.BytesIO(raw), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != 16000:
            raise ValueError('Expected mono 16 kHz PCM16 WAV audio.')
        if not 1600 <= source.getnframes() <= 256000:
            raise ValueError('Expected 0.1–16 seconds of audio.')
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    # Avoid asking a generative recognizer to interpret silence.
    rms = float(np.sqrt(np.mean(samples ** 2)))
    if rms < .0002 and float(np.max(np.abs(samples))) < .001:
        return {'text': '', 'engine': 'local-whisper', 'inference_ms': 0}
    samples = np.clip(samples * min(30.0, max(1.0, .04 / max(rms, 1e-8))), -1, 1)
    started = time.perf_counter()
    segments, _ = MODEL.transcribe(samples, language='en', beam_size=5,
                                   condition_on_previous_text=False, vad_filter=True,
                                   vad_parameters={'min_speech_duration_ms': 200, 'min_silence_duration_ms': 300})
    text = ' '.join(segment.text.strip() for segment in segments
                    if segment.avg_logprob >= -1 and segment.no_speech_prob < .6).strip()
    return {'text': text, 'engine': 'local-whisper', 'inference_ms': round((time.perf_counter()-started)*1000)}

for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        result = {'request_id': request['request_id'], 'result': process(request)}
    except Exception as error:
        result = {'request_id': request.get('request_id'), 'error': str(error)}
    print(json.dumps(result), flush=True)
