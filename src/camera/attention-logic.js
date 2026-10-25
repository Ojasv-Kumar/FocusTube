export function faceDirection(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 455) return null;
  const nose = landmarks[1], leftEye = landmarks[33], rightEye = landmarks[263], chin = landmarks[152];
  if (![nose, leftEye, rightEye, chin].every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null;
  const eyeMidX = (leftEye.x + rightEye.x) / 2, eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeWidth = Math.abs(rightEye.x - leftEye.x), faceHeight = Math.abs(chin.y - eyeMidY);
  if (eyeWidth < 0.015 || faceHeight < 0.035) return null;
  return { yaw: (nose.x - eyeMidX) / eyeWidth, pitch: (nose.y - eyeMidY) / faceHeight };
}

export function isAway(direction, calibration, yawLimit = 0.24, pitchLimit = 0.22) {
  if (!direction || !calibration) return false;
  return Math.abs(direction.yaw - calibration.yaw) >= yawLimit || Math.abs(direction.pitch - calibration.pitch) >= pitchLimit;
}

export function isOpenPalm(result, aspectRatio = 4 / 3) {
  return classifyHandGesture(result, aspectRatio) === "open-palm";
}

export function classifyHandGesture(result, aspectRatio = 4 / 3) {
  const category = result?.gestures?.[0]?.[0];
  const categoryLabels = { Open_Palm: "open-palm", Thumb_Up: "seek-forward", Thumb_Down: "seek-backward", Closed_Fist: "fast-play" };
  if (categoryLabels[category?.categoryName] && category.score >= 0.3) return categoryLabels[category.categoryName];

  // Geometry fallback makes the static poses work when the gesture label is
  // uncertain because of hand angle or lighting.
  const landmarks = result?.landmarks?.[0];
  if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
  const point = index => {
    const value = landmarks[index];
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? { x: value.x * aspectRatio, y: value.y } : null;
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a, vertex, c) => {
    const va = { x: a.x - vertex.x, y: a.y - vertex.y }, vc = { x: c.x - vertex.x, y: c.y - vertex.y };
    const denom = Math.hypot(va.x, va.y) * Math.hypot(vc.x, vc.y);
    if (denom < 1e-6) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (va.x * vc.x + va.y * vc.y) / denom))) * 180 / Math.PI;
  };
  const wrist = point(0);
  if (!wrist) return null;
  const fingers = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
  const extended = fingers.map(([mcpIndex, pipIndex, tipIndex]) => {
    const mcp = point(mcpIndex), pip = point(pipIndex), tip = point(tipIndex);
    return Boolean(mcp && pip && tip && angle(mcp, pip, tip) >= 132 && distance(wrist, tip) > distance(wrist, pip) * 1.015);
  });
  if (extended.filter(Boolean).length >= 3) return "open-palm";
  if (extended.filter(Boolean).length <= 1) {
    const thumbBase = point(2), thumbTip = point(4);
    if (thumbBase && thumbTip) {
      const dx = thumbTip.x - thumbBase.x, dy = thumbTip.y - thumbBase.y;
      if (Math.abs(dy) >= 0.045 && Math.abs(dy) >= Math.abs(dx) * 1.15) return dy < 0 ? "seek-forward" : "seek-backward";
    }
    if (extended.filter(Boolean).length === 0) return "fast-play";
  }
  return null;
}
