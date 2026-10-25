export const CAMERAS = ['Camera 1', 'Camera 2'];
export const STREAM_PROFILES = ['High', 'Medium', 'Low'];
export const TOOL_IDS = [1, 2, 3, 5];
export const TOOL_MODES = [1, 2, 3];

const clamp = (value) => Math.max(-1, Math.min(1, value));

export function normalizeJoystickPointer(clientX, clientY, bounds) {
  const coordinates = [clientX, clientY, bounds.left, bounds.right, bounds.top, bounds.bottom];
  if (!coordinates.every(Number.isFinite)) {
    return { yaw: 0, pitch: 0 };
  }

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const radius = Math.min(width, height) / 2;
  if (radius <= 0) {
    return { yaw: 0, pitch: 0 };
  }

  const centerX = bounds.left + width / 2;
  const centerY = bounds.top + height / 2;
  return {
    yaw: clamp((clientX - centerX) / radius),
    pitch: clamp((centerY - clientY) / radius),
  };
}
