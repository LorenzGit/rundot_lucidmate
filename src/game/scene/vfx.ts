/** Event juice: captures, checks, selects, mate fireworks. Hues are HSL degrees. */
import type { ParticleEmitter } from "../particles.ts";

export function captureBurst(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 34,
        lifeMinMs: 280,
        lifeMaxMs: 700,
        speedMinPxPerSec: 90,
        speedMaxPxPerSec: 340,
        radiusMinPx: 5,
        radiusMaxPx: 13,
        gravityPxPerSec2: 140,
        dragPerSec: 0.5,
        directionRad: -Math.PI / 2,
        arcRad: Math.PI * 2,
        hue: 25,
    });
    emitter.burst(x, y, {
        burst: 18,
        lifeMinMs: 180,
        lifeMaxMs: 420,
        speedMinPxPerSec: 40,
        speedMaxPxPerSec: 180,
        radiusMinPx: 3,
        radiusMaxPx: 8,
        gravityPxPerSec2: 40,
        dragPerSec: 0.35,
        directionRad: 0,
        arcRad: Math.PI * 2,
        hue: 45,
    });
}

export function checkPulse(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 42,
        lifeMinMs: 360,
        lifeMaxMs: 900,
        speedMinPxPerSec: 120,
        speedMaxPxPerSec: 380,
        radiusMinPx: 5,
        radiusMaxPx: 14,
        gravityPxPerSec2: 30,
        dragPerSec: 0.65,
        directionRad: 0,
        arcRad: Math.PI * 2,
        hue: 12,
    });
}

export function selectSpark(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 10,
        lifeMinMs: 160,
        lifeMaxMs: 320,
        speedMinPxPerSec: 30,
        speedMaxPxPerSec: 110,
        radiusMinPx: 3,
        radiusMaxPx: 6,
        gravityPxPerSec2: 20,
        dragPerSec: 0.3,
        directionRad: -Math.PI / 2,
        arcRad: Math.PI * 1.6,
        hue: 42,
    });
}

export function moveTrail(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 6,
        lifeMinMs: 140,
        lifeMaxMs: 280,
        speedMinPxPerSec: 10,
        speedMaxPxPerSec: 50,
        radiusMinPx: 3,
        radiusMaxPx: 7,
        gravityPxPerSec2: -20,
        dragPerSec: 0.2,
        directionRad: 0,
        arcRad: Math.PI * 2,
        hue: 48,
    });
}

export function mateBurst(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 56,
        lifeMinMs: 500,
        lifeMaxMs: 1100,
        speedMinPxPerSec: 80,
        speedMaxPxPerSec: 420,
        radiusMinPx: 6,
        radiusMaxPx: 16,
        gravityPxPerSec2: 80,
        dragPerSec: 0.55,
        directionRad: -Math.PI / 2,
        arcRad: Math.PI * 2,
        hue: 40,
    });
    emitter.burst(x, y, {
        burst: 40,
        lifeMinMs: 400,
        lifeMaxMs: 900,
        speedMinPxPerSec: 60,
        speedMaxPxPerSec: 300,
        radiusMinPx: 4,
        radiusMaxPx: 11,
        gravityPxPerSec2: 60,
        dragPerSec: 0.45,
        directionRad: 0,
        arcRad: Math.PI * 2,
        hue: 20,
    });
}

export function placePop(emitter: ParticleEmitter, x: number, y: number): void {
    emitter.burst(x, y, {
        burst: 12,
        lifeMinMs: 160,
        lifeMaxMs: 340,
        speedMinPxPerSec: 40,
        speedMaxPxPerSec: 140,
        radiusMinPx: 3,
        radiusMaxPx: 7,
        gravityPxPerSec2: 90,
        dragPerSec: 0.4,
        directionRad: -Math.PI / 2,
        arcRad: Math.PI,
        hue: 50,
    });
}
