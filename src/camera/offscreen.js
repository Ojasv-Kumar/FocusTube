import { FilesetResolver, FaceLandmarker, GestureRecognizer } from "../../vendor/mediapipe/runtime/vision_bundle.mjs";
import { faceDirection, isAway, classifyHandGesture } from "./attention-logic.js";

const video = document.getElementById("camera");
const TASK = "focustube.camera";
let stream = null, face = null, hands = null, timer = 0, current = null, lastAlert = new Map(), activeAlerts = new Set(), awaySince = 0, missingSince = 0, palmSince = 0, palmLatched = false, actionSince = 0, actionGesture = null, actionLatched = false, actionReleaseSince = 0, seekRepeatAt = 0, fastPlayActive = false, lastTick = 0, faceGraceUntil = 0;
const asset = path => chrome.runtime.getURL(path);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ namespace: TASK, type, payload }).catch(() => {});

async function initialize() {
  const vision = await FilesetResolver.forVisionTasks(asset("vendor/mediapipe/runtime/wasm"));
  face = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: asset("vendor/mediapipe/face_landmarker.task"), delegate: "CPU" }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false });
  hands = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: asset("vendor/mediapipe/gesture_recognizer.task"), delegate: "CPU" }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: 0.32, minHandPresenceConfidence: 0.35, minTrackingConfidence: 0.38 });
}

function stop() {
  if (fastPlayActive && current) void send("PLAYBACK_SPEED", { tabId: current.tabId, active: false });
  if (timer) clearTimeout(timer); timer = 0;
  for (const track of stream?.getTracks?.() || []) track.stop(); stream = null;
  video.srcObject = null; face?.close(); hands?.close(); face = null; hands = null; current = null;
  awaySince = missingSince = palmSince = actionSince = actionReleaseSince = seekRepeatAt = lastTick = faceGraceUntil = 0; palmLatched = actionLatched = fastPlayActive = false; actionGesture = null; lastAlert.clear(); activeAlerts.clear();
}

async function start(payload) {
  if (payload?.tabId == null || !payload?.calibration || ![payload.calibration.yaw, payload.calibration.pitch].every(Number.isFinite)) return;
  if (current?.tabId === payload.tabId && JSON.stringify(current.calibration) === JSON.stringify(payload.calibration) && stream?.active) {
    const wasGestureOnly = current.gestureOnly;
    current.gestureOnly = Boolean(payload.gestureOnly);
    if (wasGestureOnly && !current.gestureOnly) {
      // A palm gesture is an explicit resume. Give the viewer time to settle
      // back into frame before checking face presence or gaze again.
      awaySince = missingSince = 0;
      faceGraceUntil = performance.now() + 5000;
    }
    return;
  }
  stop(); current = { tabId: payload.tabId, calibration: payload.calibration, gestureOnly: Boolean(payload.gestureOnly) };
  try {
    await initialize();
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 8, max: 12 } } });
    for (const track of stream.getTracks()) track.addEventListener("ended", () => {
      if (!current || current.tabId !== payload.tabId) return;
      stop(); void send("CAMERA_ERROR", { tabId: payload.tabId, error: "CAMERA_ENDED" });
    }, { once: true });
    video.srcObject = stream; await video.play(); tick();
  } catch (error) {
    const tabId = current?.tabId; stop();
    if (tabId) await send("CAMERA_ERROR", { tabId, error: error?.name || "CAMERA_FAILED" });
  }
}

function alertIfReady(kind, now) {
  const previous = lastAlert.get(kind) || 0;
  if (!previous || now - previous >= 45_000) {
    lastAlert.set(kind, now); activeAlerts.add(kind); void send("ATTENTION_ALERT", { tabId: current.tabId, kind });
  }
}
function clearAlert(kind) { if (activeAlerts.delete(kind) && current) void send("ATTENTION_CLEAR", { tabId: current.tabId, kind }); }

function tick() {
  if (!stream?.active || !current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { timer = setTimeout(tick, 350); return; }
  const now = performance.now();
  if (now - lastTick >= 100) {
    lastTick = now;
    try {
      const gestureResult = hands.recognizeForVideo(video, now);
      const gesture = classifyHandGesture(gestureResult, video.videoWidth / video.videoHeight || 4 / 3);
      if (gesture === "open-palm") {
        if (!palmSince) palmSince = now;
        if (!palmLatched && now - palmSince >= 180) { palmLatched = true; void send("OPEN_PALM", { tabId: current.tabId }); }
      } else { palmSince = 0; palmLatched = false; }
      const isSeek = gesture === "seek-forward" || gesture === "seek-backward";
      const isAction = isSeek || gesture === "fast-play";
      if (isAction) {
        actionReleaseSince = 0;
        if (actionGesture !== gesture) {
          if (fastPlayActive) { void send("PLAYBACK_SPEED", { tabId: current.tabId, active: false }); fastPlayActive = false; }
          actionGesture = gesture; actionSince = now; actionLatched = false; seekRepeatAt = 0;
        }
        if (isSeek && !actionLatched && now - actionSince >= 100) {
          actionLatched = true; seekRepeatAt = now;
          void send("PLAYBACK_SEEK", { tabId: current.tabId, delta: gesture === "seek-forward" ? 10 : -10 });
        } else if (isSeek && actionLatched && now - actionSince >= 1000 && now - seekRepeatAt >= 500) {
          seekRepeatAt = now;
          void send("PLAYBACK_SEEK", { tabId: current.tabId, delta: gesture === "seek-forward" ? 10 : -10 });
        } else if (gesture === "fast-play" && !actionLatched && now - actionSince >= 100) {
          actionLatched = true; fastPlayActive = true; void send("PLAYBACK_SPEED", { tabId: current.tabId, active: true });
        }
      } else if (!actionReleaseSince) actionReleaseSince = now;
      else if (now - actionReleaseSince >= 200) {
        if (fastPlayActive) void send("PLAYBACK_SPEED", { tabId: current.tabId, active: false });
        actionGesture = null; actionSince = actionReleaseSince = seekRepeatAt = 0; actionLatched = fastPlayActive = false;
      }

      if (!current.gestureOnly) {
        const faceResult = face.detectForVideo(video, now), direction = faceDirection(faceResult.faceLandmarks?.[0]);
        if (now < faceGraceUntil) {
          awaySince = missingSince = 0;
          clearAlert("looking-away"); clearAlert("face-missing");
        } else if (!direction) {
          awaySince = 0; clearAlert("looking-away"); if (!missingSince) missingSince = now;
          if (now - missingSince >= 4000) alertIfReady("face-missing", now);
        } else {
          missingSince = 0; clearAlert("face-missing");
          const away = isAway(direction, current.calibration);
          if (away) { if (!awaySince) awaySince = now; if (now - awaySince >= 2500) alertIfReady("looking-away", now); }
          else { awaySince = 0; lastAlert.delete("looking-away"); clearAlert("looking-away"); }
          lastAlert.delete("face-missing");
        }
      }
    } catch (error) {
      const tabId = current?.tabId; stop(); if (tabId) void send("CAMERA_ERROR", { tabId, error: error?.name || "DETECTOR_FAILED" }); return;
    }
  }
  timer = setTimeout(tick, 70);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.namespace !== TASK) return false;
  if (message.type === "OFFSCREEN_PING") { sendResponse({ ok: true, ready: true }); return false; }
  if (message.type === "MONITOR_START") { void start(message.payload).then(() => sendResponse({ ok: true })); return true; }
  if (message.type === "MONITOR_STOP") { stop(); sendResponse({ ok: true }); return false; }
  return false;
});
void send("OFFSCREEN_READY");
