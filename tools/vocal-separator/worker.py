"""Bounded-memory, offline vocal separation. Input is stereo 44.1 kHz WAV."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    torch.set_num_threads(2)
    torch.manual_seed(0)
    model = get_model('955717e8', repo=Path(args.models)).cpu().eval()
    rate = model.samplerate
    with sf.SoundFile(args.input) as source:
        if source.samplerate != rate or source.channels != model.audio_channels:
            raise ValueError('Expected stereo 44100 Hz input')
        # Context on either side avoids hard boundaries without loading a whole movie.
        block, context = 30 * rate, 3 * rate
        with sf.SoundFile(args.output, 'w', samplerate=rate, channels=2, subtype='PCM_24') as output:
            for start in range(0, len(source), block):
                left, end = max(0, start-context), min(len(source), start+block)
                source.seek(left)
                samples = source.read(min(len(source), end+context)-left, dtype='float32', always_2d=True)
                wave = torch.from_numpy(samples.T.copy())
                ref = wave.mean(0)
                mean, std = ref.mean(), ref.std()
                if std < 1e-8:
                    vocals = np.zeros((end-start, 2), dtype=np.float32)
                else:
                    with torch.inference_mode():
                        result = apply_model(model, ((wave-mean)/std)[None], device='cpu', shifts=0, split=True, overlap=.25, progress=False, num_workers=0)[0]
                    voice = result[model.sources.index('vocals')] * std + mean
                    vocals = voice[:, start-left:end-left].T.numpy()
                output.write(np.clip(vocals, -1, 1))
                print(f'out_time_us={int(end/rate*1e6)}', flush=True)


if __name__ == '__main__':
    main()
