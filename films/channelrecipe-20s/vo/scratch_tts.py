# Scratch VO via espeak-ng (placeholder until the real read is supplied).
# Places each script line at its target start and writes vo/scratch.wav (48k mono).
# usage: <venv>/bin/python films/channelrecipe-20s/vo/scratch_tts.py
import ctypes, json, os, struct, wave
import espeakng_loader

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = json.load(open(os.path.join(HERE, 'script.json')))['lines']

lib = ctypes.cdll.LoadLibrary(espeakng_loader.get_library_path())
class EV(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('uid', ctypes.c_uint), ('text_position', ctypes.c_int), ('length', ctypes.c_int),
                ('audio_position', ctypes.c_int), ('sample', ctypes.c_int), ('user_data', ctypes.c_void_p), ('id', ctypes.c_char * 8)]
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(EV))
sr = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)
lib.espeak_SetVoiceByName(b'en-us')
lib.espeak_SetParameter(1, 168, 0)  # rate wpm
lib.espeak_SetParameter(3, 55, 0)   # pitch

buf, words = [], []
@CB
def cb(wav, n, ev):
    if wav and n > 0: buf.extend(wav[i] for i in range(n))
    i = 0
    while ev[i].type != 0:
        if ev[i].type == 1: words.append((ev[i].text_position, ev[i].audio_position))
        i += 1
    return 0
lib.espeak_SetSynthCallback(cb)

OUT_SR, total = 48000, 20.0
mix = [0.0] * int(OUT_SR * total)
for line in LINES:
    buf.clear(); words.clear()
    txt = line['text'].encode()
    lib.espeak_Synth(txt, len(txt) + 1, 0, 1, 0, 0x10 | 0, None, None)  # espeakCHARS_UTF8
    lib.espeak_Synchronize()
    # resample 22050 -> 48000 linear
    ratio = sr / OUT_SR
    start = int(line['t'] * OUT_SR)
    n = int(len(buf) / ratio)
    for i in range(n):
        x = i * ratio; j = int(x); f = x - j
        a = buf[j]; b = buf[j + 1] if j + 1 < len(buf) else 0
        if start + i < len(mix): mix[start + i] += (a + (b - a) * f) / 32768
    print(f"{line['t']:5.2f}s  {len(buf)/sr:4.2f}s  {line['text']}")

peak = max(1e-9, max(abs(v) for v in mix))
with wave.open(os.path.join(HERE, 'scratch.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(OUT_SR)
    w.writeframes(b''.join(struct.pack('<h', int(v / peak * 0.89 * 32767)) for v in mix))
