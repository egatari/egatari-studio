### Changed

- Editor: the Audio panel's answers are now **Record your own voice** (the default), **Make AI voice in the cloud (Google Colab)**,
  **Make AI voice on this computer**. With audio, it opens on the method of the newest audio (recording, Colab or this computer);
  `studio.audioMethod` in `egatari.json` is no longer read or written, and the WebGPU-based default is gone (this replaces #85's cloud default)
- Editor: the cloud is three numbered steps like the New dialog's (number badge, heading, one button): Export script, Run it in
  Colab (with the Colab instructions as a–d), Import the audio; a step that happened on this page gets a ✓
- Editor: on a phone, a tablet or a device with less than 8 GB of memory, **Make AI voice on this computer** and **Remake on this
  computer** are shown but disabled with the reason; a lesson whose newest audio was made on a computer opens on the cloud there
- Editor: **Voice** and **▶ Sample** are now the first line inside the chosen AI method (above step 1 for the cloud, above the
  button for this computer) and are not shown while recording is chosen
