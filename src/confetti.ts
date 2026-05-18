export interface ConfettiOptions {
	/**
	 * `true` for the trophy-tier (year) celebration — doubles the piece count,
	 * shifts the palette gold-heavy, and extends travel distance so the
	 * milestone feels distinctly grander than a flame-tier bump.
	 */
	grand?: boolean;
}

/**
 * Fire a one-shot CSS-driven confetti burst inside `host`. Pieces animate
 * outward on a radial trajectory with a 20px gravity drop and random rotation.
 *
 * Implementation choices:
 *   - Pure DOM + CSS custom properties; no canvas, no library, no dependency
 *     footprint on the built bundle.
 *   - Each piece gets its own randomized angle/distance/duration/spin so the
 *     burst feels organic instead of stamped.
 *   - Layer removes itself after the longest plausible animation finishes so
 *     we never leak DOM nodes; safe to call repeatedly back-to-back.
 *   - Honors `prefers-reduced-motion` — returns immediately without mutating
 *     the DOM.
 */
export function burstConfetti(
	host: HTMLElement,
	options: ConfettiOptions = {}
): void {
	if (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	) {
		return;
	}

	const grand = options.grand === true;
	const count = grand ? 36 : 18;
	const palette = grand
		? [
				"#f4a261",
				"#e9c46a",
				"#facc15",
				"#fde68a",
				"var(--interactive-accent)",
		  ]
		: [
				"var(--interactive-accent)",
				"color-mix(in srgb, var(--interactive-accent) 60%, var(--text-normal))",
				"#f4a261",
				"#e9c46a",
		  ];
	const baseDistance = grand ? 60 : 40;
	const distanceRange = grand ? 80 : 60;
	const baseDuration = grand ? 1200 : 900;
	const durationRange = grand ? 700 : 500;

	const layer = host.createDiv({ cls: "vault-pulse-confetti-layer" });

	for (let i = 0; i < count; i++) {
		const piece = layer.createSpan({ cls: "vault-pulse-confetti-piece" });
		// All CSS variables — setCssProps with custom-props is permitted by
		// the no-static-styles-assignment rule. Real properties would be
		// flagged; we have none here.
		piece.setCssProps({
			"--vp-angle": `${Math.random() * 360}deg`,
			"--vp-distance": `${baseDistance + Math.random() * distanceRange}px`,
			"--vp-duration": `${baseDuration + Math.random() * durationRange}ms`,
			"--vp-spin": `${Math.random() * 720 - 360}deg`,
			"--vp-color": palette[i % palette.length],
		});
	}

	window.setTimeout(() => layer.remove(), grand ? 2200 : 1600);
}
