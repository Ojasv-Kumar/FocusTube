import { FilesetResolver, FaceLandmarker } from "../../vendor/mediapipe/runtime/vision_bundle.mjs";
import { saveSettings, getSettings } from "../storage.js";
import { faceDirection } from "./attention-logic.js";

const $ = id => document.getElementById(id);
const video = $("preview"), startButton = $("start"), calibrateButton = $("calibrate"), stopButton = $("stop"), progress = $("progress"), status = $("status"), note = $("preview-note");
let stream = null, landmarker = null, cancelled = false, calibrating = false;
const asset = path => chrome.runtime.getURL(path);
let toastTimer;
function tell(text, error = false) {
  status.textContent = text; status.dataset.error = String(error);
  const success = text.startsWith("Setup complete.");
  status.dataset.toast = String(success);
  clearTimeout(toastTimer);
  if (success) toastTimer = setTimeout(() => { status.dataset.toast = "false"; }, 5000);
}

async function loadLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(asset("vendor/mediapipe/runtime/wasm"));
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: asset("vendor/mediapipe/face_landmarker.task"), delegate: "CPU" },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
  });
}

async function startCamera() {
  startButton.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    video.srcObject = stream; video.hidden = false; note.hidden = true; await video.play();
    tell("Loading on-device face detector…");
    landmarker = await loadLandmarker();
    startButton.textContent = "Camera allowed"; calibrateButton.disabled = false; stopButton.disabled = false;
    tell("Camera is on for setup. Look at the screen and start the 3-second calibration.");
  } catch (error) {
    stopCamera(); startButton.disabled = false;
    tell(error?.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access for FocusTube in browser settings, then try again." : `Could not start camera setup (${error?.name || "camera error"}).`, true);
  }
}

function stopCamera() {
  cancelled = true; calibrating = false; landmarker?.close(); landmarker = null;
  for (const track of stream?.getTracks?.() || []) track.stop(); stream = null;
  video.srcObject = null; video.hidden = true; note.hidden = false; progress.hidden = true;
  calibrateButton.disabled = true; stopButton.disabled = true;
  if (startButton.textContent === "Camera allowed") { startButton.textContent = "Allow camera and continue"; startButton.disabled = false; }
}

async function calibrate() {
  if (!landmarker || !stream || calibrating) return;
  calibrating = true; cancelled = false; calibrateButton.disabled = true; startButton.disabled = true; progress.hidden = false; progress.value = 0;
  tell("Calibration started. Keep looking at the center of the screen for 3 seconds.");
  const start = performance.now(), samples = []; let lastDetect = 0, busy = false;
  while (!cancelled && performance.now() - start < 3000) {
    const now = performance.now(); progress.value = Math.min(3, (now - start) / 1000);
    if (!busy && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetect >= 120) {
      busy = true; lastDetect = now;
      try { const result = landmarker.detectForVideo(video, now); const pose = faceDirection(result.faceLandmarks?.[0]); if (pose) samples.push(pose); }
      catch { /* Camera frames can be dropped while the preview starts. */ }
      busy = false;
    }
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  if (cancelled) return;
  calibrating = false; progress.value = 3; progress.hidden = true;
  if (samples.length < 8) {
    calibrateButton.disabled = false; tell("I could not get a stable face reading. Improve the light, face the camera, and try again.", true); return;
  }
  const mean = key => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  try {
    await saveSettings({ cameraEnabled: true, cameraCalibration: { version: 1, yaw: mean("yaw"), pitch: mean("pitch") } });
    tell("Setup complete. Monitoring is enabled for visible, playing YouTube videos. You can close this tab.");
    stopCamera();
  } catch {
    calibrateButton.disabled = false; tell("Calibration worked, but settings could not be saved. Keep this page open and try again.", true);
  }
}

startButton.addEventListener("click", () => void startCamera());
calibrateButton.addEventListener("click", () => void calibrate());
stopButton.addEventListener("click", () => { stopCamera(); tell("Camera stopped. No monitoring will run until you finish setup again."); });
window.addEventListener("pagehide", stopCamera);
void getSettings().then(settings => { if (settings.cameraCalibration) tell("A calibration is already saved. Recalibrate here any time; the camera remains off until you press the button."); });
