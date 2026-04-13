/**
 * Apple-authentic rubber-band scroll bounce.
 *
 * Simulates a mass-spring-damper system integrated frame-by-frame with
 * semi-implicit Euler. The wheel event at a scroll edge seeds the spring
 * with an initial velocity, and physics takes over:
 *
 *   y'' = (-k·y - c·y') / m
 *
 * Tuned to match SwiftUI's default `.spring()` — `response=0.55s`,
 * `dampingFraction=0.825` (slightly underdamped, tiny invisible overshoot
 * that reads as "alive"). Settle time ≈ 425ms, matching the feel of native
 * Apple UI animations.
 *
 * One bounce per edge-hit: sustained wheel events at the edge don't
 * re-trigger until 150ms of no edge-push.
 *
 * Respects `prefers-reduced-motion` (returns a no-op cleanup).
 *
 * To retune, change RESPONSE (oscillation period in seconds) and
 * DAMPING_FRACTION (0 = no damping, 1 = critical, >1 = overdamped).
 */
export function attachElasticScroll(
	scroller: HTMLElement,
	inner: HTMLElement,
	axis: "x" | "y"
): () => void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return () => {};
	}

	// SwiftUI-style spring parameterization. These two numbers are the entire feel.
	const RESPONSE = 0.55;
	const DAMPING_FRACTION = 0.825;
	const MASS = 1;

	// Derived physics constants. Kept here so the math is visible rather than
	// hiding 130.4 and 18.84 as magic numbers.
	const ANG_FREQ = (2 * Math.PI) / RESPONSE;
	const STIFFNESS = MASS * ANG_FREQ * ANG_FREQ;
	const DAMPING = 2 * DAMPING_FRACTION * ANG_FREQ * MASS;

	// Map wheel delta to initial spring velocity (px/s).
	// Peak amplitude for this spring ≈ v₀ · 0.094, so v0=200 → ~19px peak.
	const V0_SCALE = 7;
	const V0_MIN = 80;
	const V0_MAX = 400;
	const MIN_DELTA = 2;

	const SETTLE_Y = 0.3;
	const SETTLE_V = 4;
	const MAX_DT = 0.032;
	const RELEASE_DELAY = 150;

	let rafId: number | null = null;
	let y = 0;
	let v = 0;
	let running = false;
	let lastFrame = 0;

	let locked = false;
	let releaseTimer: number | null = null;

	const applyTransform = (offset: number) => {
		inner.style.transform =
			axis === "x"
				? `translate3d(${offset}px, 0, 0)`
				: `translate3d(0, ${offset}px, 0)`;
	};

	const step = (now: number) => {
		const dt = Math.min(MAX_DT, (now - lastFrame) / 1000);
		lastFrame = now;

		// Semi-implicit Euler: update velocity first, then position.
		// Spring force pulls toward y=0; damping opposes current velocity.
		const force = -STIFFNESS * y - DAMPING * v;
		const a = force / MASS;
		v += a * dt;
		y += v * dt;

		applyTransform(y);

		if (Math.abs(y) > SETTLE_Y || Math.abs(v) > SETTLE_V) {
			rafId = requestAnimationFrame(step);
		} else {
			inner.style.transform = "";
			inner.style.willChange = "";
			running = false;
			rafId = null;
		}
	};

	const startSpring = (initialVelocity: number) => {
		if (running) return;
		running = true;
		y = 0;
		v = initialVelocity;
		lastFrame = performance.now();
		inner.style.willChange = "transform";
		rafId = requestAnimationFrame(step);
	};

	const onWheel = (evt: WheelEvent) => {
		const delta = axis === "x" ? evt.deltaX : evt.deltaY;
		if (Math.abs(delta) < MIN_DELTA) return;

		const pos = axis === "x" ? scroller.scrollLeft : scroller.scrollTop;
		const maxScroll =
			axis === "x"
				? scroller.scrollWidth - scroller.clientWidth
				: scroller.scrollHeight - scroller.clientHeight;
		if (maxScroll <= 0) return;

		const pushingStart = pos <= 0 && delta < 0;
		const pushingEnd = pos >= maxScroll - 1 && delta > 0;
		const atEdge = pushingStart || pushingEnd;

		if (atEdge) {
			evt.preventDefault();
			if (!locked) {
				const magnitude = Math.min(
					V0_MAX,
					Math.max(V0_MIN, Math.abs(delta) * V0_SCALE)
				);
				// Velocity sign opposes the scroll push: pushing right (delta>0)
				// at the end means content should recoil leftward (negative).
				const v0 = delta > 0 ? -magnitude : magnitude;
				startSpring(v0);
				locked = true;
			}
			if (releaseTimer !== null) window.clearTimeout(releaseTimer);
			releaseTimer = window.setTimeout(() => {
				locked = false;
				releaseTimer = null;
			}, RELEASE_DELAY);
			return;
		}

		// Scrolled off the edge — release the lock so the next edge-arrival bounces.
		if (locked) {
			locked = false;
			if (releaseTimer !== null) {
				window.clearTimeout(releaseTimer);
				releaseTimer = null;
			}
		}
	};

	scroller.addEventListener("wheel", onWheel, { passive: false });

	return () => {
		scroller.removeEventListener("wheel", onWheel);
		if (rafId !== null) cancelAnimationFrame(rafId);
		if (releaseTimer !== null) window.clearTimeout(releaseTimer);
		inner.style.transform = "";
		inner.style.willChange = "";
		running = false;
	};
}
