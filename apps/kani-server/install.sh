#!/usr/bin/env bash
# Runtime for nineninesix/kani-tts-400m-ky.
# kani-tts pins nemo-toolkit[tts], and that extra makes pip backtrack for hours.
# NeMo is used here only as the NanoCodec decoder, so the [tts] extra is skipped.
# nemo-toolkit 2.4.0 pins transformers 4.53; LFM2 needs 4.57.1, so it is upgraded last.
set -euo pipefail

PYTHON="${PYTHON:-python3}"
TORCH_INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cpu}"

"$PYTHON" -m pip install --upgrade pip
if ! "$PYTHON" -c "import torch" >/dev/null 2>&1; then
  "$PYTHON" -m pip install "torch>=2.8.0" --index-url "$TORCH_INDEX"
fi
"$PYTHON" -m pip install "nemo-toolkit==2.4.0"
"$PYTHON" -m pip install --no-deps "kani-tts==1.0.1"
"$PYTHON" -m pip install -U "transformers==4.57.1"
# nemo-toolkit[tts] pins transformers<=4.52 and numpy<2, and pip backtracks for hours.
# Importing the codec still walks the NeMo package, so the import-time packages are listed here.
# huggingface-hub stays on 0.x because transformers 4.57 rejects 1.x.
"$PYTHON" -m pip install \
  "accelerate>=1.0.0" \
  "lightning==2.4.0" \
  "torchmetrics>=0.11.0" \
  "librosa>=0.10.1" \
  "soundfile>=0.12.0" \
  "omegaconf<=2.3" \
  "einops" \
  "hydra-core<=1.3.2,>1.3" \
  "matplotlib" \
  "seaborn" \
  "lhotse!=1.31.0" \
  "sentencepiece<1" \
  "jiwer>=3.1,<4" \
  "webdataset>=0.2.86" \
  "pyannote.core" \
  "pyannote.metrics" \
  "datasets>=3.0,<3.6" \
  "editdistance" \
  "inflect" \
  "pandas" \
  "num2words" \
  "pydub" \
  "resampy" \
  "braceexpand" \
  "marshmallow" \
  "pyloudnorm" \
  "sacremoses" \
  "nltk" \
  "kaldi-python-io" \
  "sox<=1.5.0" \
  "whisper-normalizer" \
  "attrdict" \
  "ipython" \
  "wandb" \
  "huggingface-hub>=0.34.0,<1.0"
"$PYTHON" -m pip install -r "$(dirname "$0")/requirements.txt"
"$PYTHON" - <<'PY'
import kani_tts
import transformers
print("kani-tts", kani_tts.__file__)
print("transformers", transformers.__version__)
PY
