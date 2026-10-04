# Scratch narration via espeak-ng (placeholder until the real read is supplied).
# Lines are read back to back with a breath between them; writes vo/scratch.wav (48k mono).
# usage: <venv with espeakng-loader>/bin/python films/titanic-bulkheads/vo/scratch_tts.py
import ctypes, json, os, struct, wave
import espeakng_loader

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = json.load(open(os.path.join(HERE, 'script.json')))['lines']
HEAD, GAP, TAIL = 0.6, 0.45, 0.2

lib = ctypes.cdll.LoadLibrary(espeakng_loader.get_library_path())
class EV(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('uid', ctypes.c_uint), ('text_position', ctypes.c_int), ('length', ctypes.c_int),
                ('audio_position', ctypes.c_int), ('sample', ctypes.c_int), ('user_data', ctypes.c_void_p), ('id', ctypes.c_char * 8)]
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(EV))
sr = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)
lib.espeak_SetVoiceByName(b'en-gb')
lib.espeak_SetParameter(1, 158, 0)  # wpm
lib.espeak_SetParameter(3, 42, 0)   # pitch

buf = []
@CB
def cb(wav, n, ev):
    if wav and n > 0: buf.extend(wav[i] for i in range(n))
    return 0
lib.espeak_SetSynthCallback(cb)

OUT_SR = 48000
clips = []
for line in LINES:
    buf.clear()
    txt = line['text'].encode()
    lib.espeak_Synth(txt, len(txt) + 1, 0, 1, 0, 0x10, None, None)
    lib.espeak_Synchronize()
    # trim trailing silence espeak appends
    end = len(buf)
    while end > 0 and abs(buf[end - 1]) < 200: end -= 1
    clips.append(buf[:end])

ratio = sr / OUT_SR
total = HEAD + sum(len(c) / sr + GAP for c in clips) + TAIL
mix = [0.0] * int(OUT_SR * total)
t = HEAD
for c, line in zip(clips, LINES):
    start = int(t * OUT_SR)
    n = int(len(c) / ratio)
    for i in range(n):
        x = i * ratio; j = int(x); f = x - j
        a = c[j]; b = c[j + 1] if j + 1 < len(c) else 0
        mix[start + i] += (a + (b - a) * f) / 32768
    print(f"{t:6.2f}s  {len(c)/sr:5.2f}s  {line['text'][:60]}")
    t += len(c) / sr + GAP

peak = max(1e-9, max(abs(v) for v in mix))
with wave.open(os.path.join(HERE, 'scratch.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(OUT_SR)
    w.writeframes(b''.join(struct.pack('<h', int(v / peak * 0.89 * 32767)) for v in mix))
print(f"total {total:.2f}s")
