/**
 * DOM smoke test for confetti.ts — guards the createDiv/createSpan refactor
 * from 0.3.3 (Community Portal review).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../tests/__mocks__/obsidian";
import { burstConfetti } from "../src/confetti";

function makeHost(): HTMLDivElement {
	const c = document.createElement("div");
	document.body.appendChild(c);
	return c;
}

describe("burstConfetti", () => {
	beforeEach(() => {
		// Force reduced-motion = false for this suite.
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation((q: string) => ({
				matches: false,
				media: q,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("standard burst attaches a layer with 18 pieces", () => {
		const host = makeHost();
		burstConfetti(host);
		const layer = host.querySelector(".vault-pulse-confetti-layer");
		expect(layer).not.toBeNull();
		const pieces = layer!.querySelectorAll(".vault-pulse-confetti-piece");
		expect(pieces).toHaveLength(18);
		// Each piece has CSS variables set (not real properties).
		for (const piece of Array.from(pieces).slice(0, 3) as HTMLElement[]) {
			expect(piece.style.getPropertyValue("--vp-angle")).toMatch(/deg$/);
			expect(piece.style.getPropertyValue("--vp-distance")).toMatch(/px$/);
			expect(piece.style.getPropertyValue("--vp-color")).not.toBe("");
		}
	});

	it("grand burst doubles the piece count", () => {
		const host = makeHost();
		burstConfetti(host, { grand: true });
		const pieces = host.querySelectorAll(".vault-pulse-confetti-piece");
		expect(pieces).toHaveLength(36);
	});

	it("cleans up the layer after the burst completes", () => {
		const host = makeHost();
		burstConfetti(host);
		expect(host.querySelector(".vault-pulse-confetti-layer")).not.toBeNull();
		vi.advanceTimersByTime(2000); // > 1600ms cleanup
		expect(host.querySelector(".vault-pulse-confetti-layer")).toBeNull();
	});

	it("no-ops when reduced motion is preferred", () => {
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation((q: string) => ({
				matches: true,
				media: q,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
		const host = makeHost();
		burstConfetti(host);
		expect(host.querySelector(".vault-pulse-confetti-layer")).toBeNull();
	});
});
