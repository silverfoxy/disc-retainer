# Disc Retainer

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

## Local development

Run `node server.mjs` and open <http://127.0.0.1:8770>.
The model, manual controls, notebook storage and exports work without Python.
Local voice recognition additionally requires the local Whisper setup described
below. The browser requests microphone access only after Start listening or Check
microphone is selected.

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
- “reset disc four” / “reset all discs”
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
