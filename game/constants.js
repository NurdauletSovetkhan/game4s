export const DESKTOP_VIEW = { width: 1180, height: 640 };
export const MOBILE_PORTRAIT_VIEW = { width: 900, height: 1280 };
export const MOBILE_LANDSCAPE_VIEW = { width: 1140, height: 760 };
export const TABLET_PORTRAIT_VIEW = { width: 1040, height: 1380 };
export const TABLET_LANDSCAPE_VIEW = { width: 1320, height: 900 };

export const MAX_DRAG = 190;
export const MIN_DRAG_TO_SHOT = 10;
export const STOP_SPEED = 32;
export const ROLL_DAMPING = 0.96;
export const AIR_DAMPING = 0.999;
export const SPIKE_STEP = 28;
export const MULTI_POLL_MS = 100;
export const MULTI_LIVE_SYNC_MS = 90;

export function randInt(min, max) {
	return Math.floor(Math.random() * (max + 1 - min) + min);
}

export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function scaledRect(rect, scale) {
	const cx = rect.x + rect.w * 0.5;
	const cy = rect.y + rect.h * 0.5;
	const nw = rect.w * scale;
	const nh = rect.h * scale;
	return { x: cx - nw * 0.5, y: cy - nh * 0.5, w: nw, h: nh };
}

export function parseAnswerInput(text) {
	const clean = text.trim().replace(',', '.');
	if (!clean) return NaN;

	if (/^-?\d+\/-?\d+$/.test(clean)) {
		const [left, right] = clean.split('/').map(Number);
		if (right === 0) return NaN;
		return left / right;
	}

	return Number(clean);
}