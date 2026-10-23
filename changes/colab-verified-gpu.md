### Changed
- Colab の確認した範囲に、固定した版（cuda13 の組）で GPU を通したこと（2026-10-24、T4、23 ステップを 42 秒）を記した。ノートブックが取得時に出す「HF_TOKEN を設定してください」の警告だけを消した（ほかの警告はそのまま）。
- Colab の音声を別の教材に取り込もうとしたときの断り書きを、「docId が違う」ではなく、台本を書き出した教材の題を出して次にすることまで言う文にした。題は tts-job.json に任意で入れ、ノートブックが records.json に写す（古い zip は題なしの文で断る）。inputHash などの検証は変わらない。
- Colab の Kokoro も T4 で確認した（2026-10-24、59 ステップを 30 秒）。Kokoro の実行プロバイダは CUDA と CPU だけを頼み（TensorRT を頼んで出ていた長い EP Error を出さない）、phonemizer の「words count mismatch」の警告も止めた（ほかの警告はそのまま）。
