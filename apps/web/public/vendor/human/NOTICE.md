# Browser face model provenance

Human browser runtime: @vladmandic/human 3.3.6 (MIT), downloaded from the npm package. The bundled BlazeFace, FaceMesh, anti-spoof and liveness model pairs are unchanged from that package.

MobileFace model files are unchanged from vladmandic/human-models commit bc66dc53bac03c96d35a7e6daaf717e72f3985f5, models/mobileface.json and models/mobileface.bin. SHA256SUMS pins the exact deployed files. Upstream distribution: MIT (LICENSE-models.txt).

Original model sources recorded in the model manifests:

- BlazeFace and FaceMesh: https://github.com/google/mediapipe — Apache 2.0.
- MobileFace: https://github.com/becauseofAI/MobileFace — MIT (LICENSE-MobileFace.txt).
- Liveness: https://github.com/leokwu/livenessnet — Apache 2.0.
- Anti-spoof conversion: https://github.com/vladmandic/human-models; model source https://www.kaggle.com/anku420/fake-face-detection.

The application disables age, gender, emotion, iris, body, hand and object inference. It uses 256-value MobileFace embeddings and local face-quality/liveness checks. No camera image is uploaded. A supervised operator verifies the selected identity and consent. Encrypted templates can be deleted. This browser workflow is not an unattended biometric identity service; camera suitability and matching thresholds need school-device validation.
