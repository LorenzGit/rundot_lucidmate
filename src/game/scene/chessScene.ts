/**
 * LUCIDMATE board scene — clear board + heavy event juice:
 * sliding moves, selection bounce, check shake, particles, ambient sparkles.
 */
import { Application, Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import type { ChessMatch } from "../chess/game.ts";
import type { Move, PieceType } from "../chess/types.ts";
import { getTheme, type ThemeId, type TripTheme } from "../art/palette.ts";
import { createPieceGraphic } from "../art/pieces.ts";
import { createParticleEmitter, type ParticleEmitter } from "../particles.ts";
import type { Stage } from "../stage.ts";
import { ease, type TweenController, createTweenController } from "../tween.ts";
import { computeBoardLayout, localToSquare, squareToLocal, type BoardLayout, type Insets } from "./layout.ts";
import { captureBurst, checkPulse, mateBurst, moveTrail, placePop, selectSpark } from "./vfx.ts";
import { DreamBreathFilter } from "./dreamBreathFilter.ts";

export interface ChessSceneCallbacks {
    onPlayerMoved(move: Move): void;
    onNeedPromotion(): void;
    onIllegal(): void;
    onMatchOver(): void;
    onSelect(): void;
}

export interface ChessSceneOptions {
    app: Application;
    stage: Stage;
    match: ChessMatch;
    themeId: ThemeId;
    reducedMotion: boolean;
    quality: "high" | "low";
    insets: Insets;
    callbacks: ChessSceneCallbacks;
}

interface PieceSprite {
    sq: number;
    root: Container;
    baseScale: number;
}

interface AmbientSpark {
    g: Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    radius: number;
}

export class ChessScene {
    private readonly app: Application;
    private readonly stage: Stage;
    private readonly match: ChessMatch;
    private readonly callbacks: ChessSceneCallbacks;
    private readonly root: Container;
    private readonly stageGfx: Graphics;
    private readonly dreamFilter: DreamBreathFilter;
    private readonly boardLayer: Container;
    private readonly squareGfx: Graphics;
    private readonly highlightGfx: Graphics;
    private readonly pieceLayer: Container;
    private readonly fxLayer: Container;
    private readonly ambientLayer: Container;
    private readonly statusText: Text;
    private readonly emitter: ParticleEmitter;
    private readonly tweens: TweenController;
    private pieces = new Map<number, PieceSprite>();
    private layout: BoardLayout = { originX: 0, originY: 0, cell: 64, size: 512 };
    private insets: Insets;
    private theme: TripTheme;
    private reducedMotion: boolean;
    private quality: "high" | "low";
    private time = 0;
    private pulse = 0;
    private shake = 0;
    private selectPulse = 0;
    private destroyed = false;
    private unsubResize: (() => void) | null = null;
    private ticker = (ticker: { deltaMS: number }) => this.update(ticker.deltaMS / 1000);
    private hintSquares: number[] = [];
    private hintTimer = 0;
    private moving = false;
    private ambient: AmbientSpark[] = [];
    private ambientSpawn = 0;
    private lastStatus = "";

    constructor(opts: ChessSceneOptions) {
        this.app = opts.app;
        this.stage = opts.stage;
        this.match = opts.match;
        this.callbacks = opts.callbacks;
        this.insets = opts.insets;
        this.theme = getTheme(opts.themeId);
        this.reducedMotion = opts.reducedMotion;
        this.quality = opts.quality;

        this.root = new Container();
        this.stageGfx = new Graphics();
        this.dreamFilter = new DreamBreathFilter();
        this.stageGfx.filters = this.quality === "high" ? [this.dreamFilter] : [];
        this.boardLayer = new Container();
        this.squareGfx = new Graphics();
        this.highlightGfx = new Graphics();
        this.pieceLayer = new Container();
        this.fxLayer = new Container();
        this.ambientLayer = new Container();
        this.statusText = new Text({
            text: "",
            style: {
                fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
                fontSize: 22,
                fontWeight: "700",
                fill: 0xffffff,
                align: "center",
                letterSpacing: 1.2,
                dropShadow: {
                    alpha: 0.55,
                    blur: 4,
                    color: 0x000000,
                    distance: 1,
                },
            },
        });
        this.statusText.anchor.set(0.5, 0.5);

        this.stage.root.addChild(this.root);
        this.root.addChild(this.stageGfx);
        this.root.addChild(this.ambientLayer);
        this.root.addChild(this.boardLayer);
        this.boardLayer.addChild(this.squareGfx);
        this.boardLayer.addChild(this.highlightGfx);
        this.boardLayer.addChild(this.pieceLayer);
        this.root.addChild(this.fxLayer);
        this.root.addChild(this.statusText);

        this.emitter = createParticleEmitter(this.fxLayer);
        this.tweens = createTweenController();

        this.boardLayer.eventMode = "static";
        this.boardLayer.cursor = "pointer";
        this.boardLayer.on("pointertap", this.onTap);

        this.unsubResize = this.stage.onResize(() => this.relayout());
        this.relayout();
        this.rebuildPieces({ animateIn: !this.reducedMotion });
        this.paintBoard();
        this.updateStatusLabel(true);
        this.app.ticker.add(this.ticker);
        this.playBoardIntro();
    }

    setInsets(insets: Insets): void {
        this.insets = insets;
        this.relayout();
    }

    setTheme(id: ThemeId): void {
        this.theme = getTheme(id);
        this.rebuildPieces();
        this.paintStage();
        this.paintBoard();
        this.updateStatusLabel(true);
    }

    setReducedMotion(value: boolean): void {
        this.reducedMotion = value;
        if (value) {
            this.clearAmbient();
            this.shake = 0;
            this.boardLayer.x = 0;
            this.boardLayer.y = 0;
        }
    }

    setQuality(value: "high" | "low"): void {
        this.quality = value;
        this.stageGfx.filters = value === "high" ? [this.dreamFilter] : [];
        this.paintStage();
    }

    setPaused(paused: boolean): void {
        if (paused) this.app.ticker.remove(this.ticker);
        else if (!this.destroyed) this.app.ticker.add(this.ticker);
    }

    showHint(from: number, to: number): void {
        this.hintSquares = [from, to];
        this.hintTimer = 2.4;
        this.paintBoard();
        if (!this.reducedMotion) {
            const a = squareToLocal(this.layout, from, this.flipped());
            const b = squareToLocal(this.layout, to, this.flipped());
            selectSpark(this.emitter, a.x, a.y);
            selectSpark(this.emitter, b.x, b.y);
        }
    }

    syncFromMatch(opts?: { animateMove?: Move; captureAt?: { x: number; y: number } | null }): void {
        if (opts?.animateMove) {
            this.animateMove(opts.animateMove);
        } else {
            this.rebuildPieces();
        }
        this.paintBoard();
        this.updateStatusLabel();

        const snap = this.match.snapshot();
        if (snap.status === "check" || snap.status === "checkmate") {
            this.pulse = 1;
            this.shake = snap.status === "checkmate" ? 14 : 9;
            const kingSq = snap.board.findIndex((p) => p && p.type === "k" && p.color === snap.turn);
            if (kingSq >= 0) {
                const pos = squareToLocal(this.layout, kingSq, this.flipped());
                checkPulse(this.emitter, pos.x, pos.y);
                if (snap.status === "checkmate" && !this.reducedMotion) {
                    mateBurst(this.emitter, pos.x, pos.y);
                    const center = {
                        x: this.layout.originX + this.layout.size / 2,
                        y: this.layout.originY + this.layout.size / 2,
                    };
                    mateBurst(this.emitter, center.x, center.y);
                }
            }
        }

        // Capture particles fire on move impact inside animateMove (or immediately
        // below when reduced-motion skips the slide).
        if (this.reducedMotion && opts?.captureAt) {
            captureBurst(this.emitter, opts.captureAt.x, opts.captureAt.y);
        }

        if (this.match.isOver()) {
            this.callbacks.onMatchOver();
        }
    }

    private flipped(): boolean {
        // Flip so the human always sits at the bottom in AI and online play.
        return (
            this.match.config.playerColor === "b" &&
            (this.match.config.opponent === "ai" || this.match.config.opponent === "online")
        );
    }

    private playBoardIntro(): void {
        // Never scale the board layer: Pixi pivots from top-left by default, so
        // a stuck scale < 1 permanently left-biases gutters. Piece intro carries
        // the enter juice; the board is always full-size and centered.
        this.boardLayer.alpha = 1;
        this.boardLayer.scale.set(1);
        this.boardLayer.position.set(0, 0);
        this.boardLayer.pivot.set(0, 0);
        this.statusText.alpha = 1;
    }

    private relayout(): void {
        this.layout = computeBoardLayout(this.stage.designWidth(), this.stage.designHeight(), this.insets);
        this.statusText.x = this.stage.designWidth() / 2;
        // Midway between HUD band and board frame — never on the pieces.
        this.statusText.y = this.layout.originY - 36;
        this.paintStage();
        this.paintBoard();
        if (!this.moving) this.repositionPieces();
    }

    private paintStage(): void {
        const w = this.stage.designWidth();
        const h = this.stage.designHeight();
        const g = this.stageGfx;
        g.clear();
        g.rect(0, 0, w, h);
        g.fill({ color: this.theme.stage, alpha: 1 });
        g.circle(w * 0.5, h * 0.28, Math.max(w, h) * 0.4);
        g.fill({ color: this.theme.accent, alpha: 0.07 });
        g.circle(w * 0.85, h * 0.8, Math.max(w, h) * 0.32);
        g.fill({ color: this.theme.accent2, alpha: 0.06 });
        g.rect(0, h - Math.max(110, this.insets.bottom + 90), w, Math.max(110, this.insets.bottom + 90));
        g.fill({ color: 0x000000, alpha: 0.32 });
    }

    private paintBoard(): void {
        const { originX, originY, cell, size } = this.layout;
        const g = this.squareGfx;
        g.clear();

        g.roundRect(originX - 12, originY - 12, size + 24, size + 24, 20);
        g.fill({ color: this.theme.accent, alpha: 0.16 + this.pulse * 0.18 });
        g.roundRect(originX - 6, originY - 6, size + 12, size + 12, 16);
        g.fill({ color: this.theme.outline, alpha: 0.12 });
        g.roundRect(originX - 2, originY - 2, size + 4, size + 4, 12);
        g.fill({ color: this.theme.stage, alpha: 1 });

        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const dark = (file + rank) % 2 === 1;
                const color = dark ? this.theme.dark : this.theme.light;
                const x = originX + file * cell;
                const y = originY + rank * cell;
                g.roundRect(x + 1.5, y + 1.5, cell - 3, cell - 3, 7);
                g.fill({ color, alpha: 0.96 });
            }
        }

        const h = this.highlightGfx;
        h.clear();
        const snap = this.match.snapshot();
        const pulse = this.reducedMotion ? 0 : Math.sin(this.time * 6) * 0.5 + 0.5;

        if (snap.lastMove) {
            for (const sq of [snap.lastMove.from, snap.lastMove.to]) {
                const p = squareToLocal(this.layout, sq, this.flipped());
                h.roundRect(p.x - cell * 0.48, p.y - cell * 0.48, cell * 0.96, cell * 0.96, 8);
                // Soft gold wash — not the checker green/purple
                h.fill({ color: this.theme.moveMark, alpha: 0.22 + pulse * 0.08 });
            }
        }
        if (snap.selected !== null) {
            const p = squareToLocal(this.layout, snap.selected, this.flipped());
            const r = cell * (0.42 + this.selectPulse * 0.04 + pulse * 0.02);
            h.circle(p.x, p.y, r);
            h.stroke({ width: 3.5, color: this.theme.moveMark, alpha: 0.95 });
            h.circle(p.x, p.y, r * 1.14);
            h.stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 + pulse * 0.25 });
        }
        for (const sq of snap.legalTargets) {
            const p = squareToLocal(this.layout, sq, this.flipped());
            const occupied = snap.board[sq] !== null;
            if (occupied) {
                // Capture target: red ring, clearly not a square color
                h.circle(p.x, p.y, cell * (0.4 + pulse * 0.02));
                h.stroke({ width: 3.5, color: this.theme.captureMark, alpha: 0.9 });
                h.circle(p.x, p.y, cell * 0.32);
                h.stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
            } else {
                // Quiet move: sky-gold disc with dark ring so it never blends into cream/green squares
                const r = cell * (0.12 + pulse * 0.015);
                h.circle(p.x, p.y, r);
                h.fill({ color: this.theme.moveMark, alpha: 0.92 });
                h.circle(p.x, p.y, r);
                h.stroke({ width: Math.max(1.5, cell * 0.03), color: 0x1a1424, alpha: 0.75 });
            }
        }
        if (this.hintTimer > 0) {
            for (const sq of this.hintSquares) {
                const p = squareToLocal(this.layout, sq, this.flipped());
                h.circle(p.x, p.y, cell * (0.38 + pulse * 0.04));
                h.stroke({ width: 3.5, color: this.theme.moveMark, alpha: 0.7 + pulse * 0.25 });
                h.circle(p.x, p.y, cell * 0.28);
                h.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
            }
        }

        this.boardLayer.hitArea = {
            contains: (x: number, y: number) =>
                x >= originX && y >= originY && x <= originX + size && y <= originY + size,
        } as never;
    }

    private rebuildPieces(opts?: { animateIn?: boolean }): void {
        // Drop in-flight tweens that might still touch destroyed piece roots.
        this.tweens.clear();
        for (const sprite of this.pieces.values()) sprite.root.destroy({ children: true });
        this.pieces.clear();
        const snap = this.match.snapshot();
        let delay = 0;
        for (let sq = 0; sq < 64; sq++) {
            const piece = snap.board[sq];
            if (!piece) continue;
            const root = createPieceGraphic(piece.type, piece.color, this.theme, this.layout.cell);
            const pos = squareToLocal(this.layout, sq, this.flipped());
            root.x = pos.x;
            root.y = pos.y;
            // Always fully visible — intro only overshoots scale, never zeros it.
            root.alpha = 1;
            root.scale.set(1);
            this.pieceLayer.addChild(root);
            this.pieces.set(sq, { sq, root, baseScale: 1 });
            if (opts?.animateIn && !this.reducedMotion) {
                root.scale.set(0.55);
                const d = delay;
                delay += 10;
                this.tweens.addTween(
                    (v) => {
                        if (!root.destroyed) root.scale.set(v);
                    },
                    0.55,
                    1,
                    ease.outBack,
                    () => {
                        if (!root.destroyed) root.scale.set(1);
                    },
                    { durationMs: 260, delayMs: d },
                );
            }
        }
    }

    private repositionPieces(): void {
        this.rebuildPieces();
    }

    /**
     * Slide the piece from origin square to destination with a lift arc.
     * Captures fire particles at impact; landing pops scale.
     */
    private animateMove(move: Move): void {
        const fromPos = squareToLocal(this.layout, move.from, this.flipped());
        const toPos = squareToLocal(this.layout, move.to, this.flipped());

        if (this.reducedMotion) {
            this.rebuildPieces();
            if (move.capture) captureBurst(this.emitter, toPos.x, toPos.y);
            else placePop(this.emitter, toPos.x, toPos.y);
            return;
        }

        this.moving = true;
        // Snapshot the moving piece graphic before rebuild
        const old = this.pieces.get(move.from);
        const flying = old
            ? old.root
            : createPieceGraphic(move.promotion ?? move.piece, move.color, this.theme, this.layout.cell);
        // Rebuild everything except we'll re-add the flier
        for (const sprite of this.pieces.values()) {
            if (sprite.root !== flying) sprite.root.destroy({ children: true });
        }
        this.pieces.clear();
        const snap = this.match.snapshot();
        for (let sq = 0; sq < 64; sq++) {
            if (sq === move.to) continue; // flier lands here
            const piece = snap.board[sq];
            if (!piece) continue;
            const root = createPieceGraphic(piece.type, piece.color, this.theme, this.layout.cell);
            const pos = squareToLocal(this.layout, sq, this.flipped());
            root.x = pos.x;
            root.y = pos.y;
            this.pieceLayer.addChild(root);
            this.pieces.set(sq, { sq, root, baseScale: 1 });
        }

        if (!flying.parent) this.pieceLayer.addChild(flying);
        this.pieceLayer.setChildIndex(flying, this.pieceLayer.children.length - 1);
        flying.x = fromPos.x;
        flying.y = fromPos.y;
        flying.scale.set(1);
        flying.alpha = 1;

        const duration = move.capture ? 260 : 220;
        const lift = this.layout.cell * 0.28;
        let trailTick = 0;

        this.tweens.addTween(
            (u) => {
                if (flying.destroyed) return;
                const x = fromPos.x + (toPos.x - fromPos.x) * u;
                const y = fromPos.y + (toPos.y - fromPos.y) * u - Math.sin(u * Math.PI) * lift;
                flying.x = x;
                flying.y = y;
                flying.scale.set(1 + Math.sin(u * Math.PI) * 0.12);
                trailTick += 1;
                if (trailTick % 3 === 0) moveTrail(this.emitter, x, y);
            },
            0,
            1,
            ease.outCubic,
            () => {
                if (flying.destroyed) {
                    this.moving = false;
                    this.rebuildPieces();
                    return;
                }
                flying.x = toPos.x;
                flying.y = toPos.y;
                // Promotion: swap pawn silhouette for the chosen piece mid-land
                let landed = flying;
                if (move.promotion) {
                    flying.destroy({ children: true });
                    landed = createPieceGraphic(move.promotion, move.color, this.theme, this.layout.cell);
                    landed.x = toPos.x;
                    landed.y = toPos.y;
                    this.pieceLayer.addChild(landed);
                }
                this.pieces.set(move.to, { sq: move.to, root: landed, baseScale: 1 });
                this.moving = false;
                landed.scale.set(0.78);
                this.tweens.addTween(
                    (v) => {
                        if (!landed.destroyed) landed.scale.set(v);
                    },
                    0.78,
                    1,
                    ease.outBack,
                    undefined,
                    { durationMs: 200 },
                );
                if (move.capture) captureBurst(this.emitter, toPos.x, toPos.y);
                else placePop(this.emitter, toPos.x, toPos.y);
                this.shake = Math.max(this.shake, move.capture ? 5 : 2.5);
            },
            { durationMs: duration },
        );
    }

    private bounceSelect(sq: number): void {
        const sprite = this.pieces.get(sq);
        if (!sprite || this.reducedMotion) return;
        this.selectPulse = 1;
        const root = sprite.root;
        root.scale.set(1);
        this.tweens.addTween(
            (v) => root.scale.set(v),
            1,
            1.16,
            ease.outBack,
            () => {
                this.tweens.addTween((v) => root.scale.set(v), 1.16, 1, ease.outCubic, undefined, {
                    durationMs: 140,
                });
            },
            { durationMs: 160 },
        );
        const pos = squareToLocal(this.layout, sq, this.flipped());
        selectSpark(this.emitter, pos.x, pos.y);
    }

    private shakeIllegal(): void {
        if (this.reducedMotion) return;
        this.shake = Math.max(this.shake, 7);
        // Flash edge
        this.pulse = Math.max(this.pulse, 0.55);
    }

    private updateStatusLabel(force = false): void {
        const snap = this.match.snapshot();
        // Routine turn copy lives in the React HUD. Pixi only banners urgent states
        // so we never park body text on the board frame.
        let text = "";
        if (snap.status === "checkmate") text = "CHECKMATE";
        else if (snap.status === "stalemate") text = "STALEMATE";
        else if (snap.status === "draw") text = "DRAW";
        else if (snap.status === "check") text = "CHECK";

        const changed = text !== this.lastStatus;
        this.lastStatus = text;
        this.statusText.text = text;
        this.statusText.visible = text.length > 0;
        this.statusText.style.fill =
            snap.status === "check" || snap.status === "checkmate" ? this.theme.accent2 : 0xf2ece4;

        if (text && (changed || force) && !this.reducedMotion) {
            this.statusText.scale.set(0.85);
            this.statusText.alpha = 0.4;
            this.tweens.addTween(
                (v) => {
                    this.statusText.scale.set(0.85 + v * 0.15);
                    this.statusText.alpha = 0.4 + v * 0.6;
                },
                0,
                1,
                ease.outBack,
                undefined,
                { durationMs: 240 },
            );
        } else if (!text) {
            this.statusText.alpha = 1;
            this.statusText.scale.set(1);
        }
    }

    private onTap = (event: FederatedPointerEvent): void => {
        if (this.moving) return;
        const rootLocal = this.root.toLocal(event.global);
        // Account for board shake offset
        const local = {
            x: rootLocal.x - this.boardLayer.x,
            y: rootLocal.y - this.boardLayer.y,
        };
        const sq = localToSquare(this.layout, local.x, local.y, this.flipped());
        if (sq === null) return;

        const result = this.match.tapSquare(sq);
        if (result.kind === "select") {
            this.paintBoard();
            this.bounceSelect(sq);
            this.callbacks.onSelect();
            return;
        }
        if (result.kind === "deselect") {
            this.paintBoard();
            this.callbacks.onSelect();
            return;
        }
        if (result.kind === "illegal") {
            this.paintBoard();
            this.shakeIllegal();
            this.callbacks.onIllegal();
            return;
        }
        if (result.kind === "need-promotion") {
            this.paintBoard();
            this.callbacks.onNeedPromotion();
            return;
        }
        if (result.kind === "move" && result.move) {
            const capturePos = result.move.capture ? squareToLocal(this.layout, result.move.to, this.flipped()) : null;
            this.syncFromMatch({ animateMove: result.move, captureAt: capturePos });
            this.callbacks.onPlayerMoved(result.move);
        }
    };

    choosePromotion(type: PieceType): void {
        const result = this.match.promote(type);
        if (result.kind === "move" && result.move) {
            const capturePos = result.move.capture ? squareToLocal(this.layout, result.move.to, this.flipped()) : null;
            this.syncFromMatch({ animateMove: result.move, captureAt: capturePos });
            this.callbacks.onPlayerMoved(result.move);
        }
    }

    applyExternalMove(move: Move): void {
        const capturePos = move.capture ? squareToLocal(this.layout, move.to, this.flipped()) : null;
        this.syncFromMatch({ animateMove: move, captureAt: capturePos });
    }

    refreshOnly(): void {
        this.paintBoard();
        this.updateStatusLabel();
    }

    private spawnAmbient(dt: number): void {
        if (this.reducedMotion || this.quality === "low") return;
        this.ambientSpawn -= dt;
        if (this.ambientSpawn > 0) return;
        this.ambientSpawn = 0.22;
        if (this.ambient.length > 22) return;

        const w = this.stage.designWidth();
        const h = this.stage.designHeight();
        // Deterministic-ish from time (no Math.random in game logic files if possible - check-game forbids Math.random)
        // Use noise from time for ambient presentation
        const seed = this.time * 12.9898;
        const r1 = Math.abs(Math.sin(seed) * 43758.5453) % 1;
        const r2 = Math.abs(Math.sin(seed * 1.7) * 23421.631) % 1;
        const r3 = Math.abs(Math.sin(seed * 2.3) * 19234.12) % 1;
        const g = new Graphics();
        const radius = 1.5 + r3 * 2.5;
        const huePick = r1 > 0.5 ? this.theme.accent : this.theme.moveMark;
        g.circle(0, 0, radius);
        g.fill({ color: huePick, alpha: 0.35 });
        const spark: AmbientSpark = {
            g,
            x: r1 * w,
            y: h * 0.15 + r2 * h * 0.7,
            vx: (r2 - 0.5) * 18,
            vy: -12 - r3 * 22,
            life: 0,
            maxLife: 1.8 + r1 * 1.4,
            radius,
        };
        g.x = spark.x;
        g.y = spark.y;
        this.ambientLayer.addChild(g);
        this.ambient.push(spark);
    }

    private updateAmbient(dt: number): void {
        for (let i = this.ambient.length - 1; i >= 0; i--) {
            const s = this.ambient[i]!;
            s.life += dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            const u = s.life / s.maxLife;
            s.g.x = s.x;
            s.g.y = s.y;
            s.g.alpha = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
            s.g.scale.set(1 + Math.sin(u * Math.PI) * 0.4);
            if (s.life >= s.maxLife) {
                s.g.destroy();
                this.ambient.splice(i, 1);
            }
        }
    }

    private clearAmbient(): void {
        for (const s of this.ambient) s.g.destroy();
        this.ambient.length = 0;
    }

    private update(dt: number): void {
        if (this.destroyed) return;
        this.time += dt;
        if (!this.reducedMotion && this.quality === "high") this.dreamFilter.time = this.time;
        // Failsafe: never leave the board scaled/offset (creates left-biased gutters)
        // or partially transparent after boot.
        if (this.boardLayer.alpha < 1) this.boardLayer.alpha = 1;
        if (this.boardLayer.scale.x !== 1 || this.boardLayer.scale.y !== 1) this.boardLayer.scale.set(1);
        if (this.boardLayer.pivot.x !== 0 || this.boardLayer.pivot.y !== 0) this.boardLayer.pivot.set(0, 0);
        // Shake may offset position briefly; only reset when not shaking.
        if (this.shake <= 0.1) {
            if (this.boardLayer.x !== 0) this.boardLayer.x = 0;
            if (this.boardLayer.y !== 0) this.boardLayer.y = 0;
        }
        if (this.statusText.alpha < 1 && this.statusText.visible) this.statusText.alpha = 1;
        this.pulse = Math.max(0, this.pulse - dt * 0.9);
        this.selectPulse = Math.max(0, this.selectPulse - dt * 2.2);
        this.shake = Math.max(0, this.shake - dt * 28);

        if (this.hintTimer > 0) {
            this.hintTimer -= dt;
            if (this.hintTimer <= 0) {
                this.hintSquares = [];
            }
        }

        // Redraw only while a visible board mark is animating. Rebuilding the
        // complete Graphics mesh every idle frame wastes battery and can make
        // WebGL compositors present partially updated tiles.
        const snap = this.match.snapshot();
        const hasAnimatedBoardMarks =
            this.pulse > 0 ||
            this.hintTimer > 0 ||
            snap.selected !== null ||
            snap.lastMove !== null ||
            snap.legalTargets.length > 0;
        const shouldPaintBoard = this.reducedMotion ? this.pulse > 0 || this.hintTimer > 0 : hasAnimatedBoardMarks;
        if (shouldPaintBoard) this.paintBoard();

        // Screen / board shake
        if (this.shake > 0.1 && !this.reducedMotion) {
            const mag = this.shake;
            // Use sin of time for direction so it feels organic
            this.boardLayer.x = Math.sin(this.time * 62) * mag * 0.55;
            this.boardLayer.y = Math.cos(this.time * 54) * mag * 0.4;
        } else {
            this.boardLayer.x = 0;
            this.boardLayer.y = 0;
        }

        // Soft float on selected piece
        if (!this.reducedMotion && !this.moving) {
            const sel = this.match.snapshot().selected;
            if (sel !== null) {
                const sprite = this.pieces.get(sel);
                if (sprite && !sprite.root.destroyed) {
                    const pos = squareToLocal(this.layout, sel, this.flipped());
                    sprite.root.y = pos.y + Math.sin(this.time * 5) * 2.5;
                }
            }
        }

        this.spawnAmbient(dt);
        this.updateAmbient(dt);
        this.emitter.update(dt);
        this.tweens.update(dt);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.app.ticker.remove(this.ticker);
        this.unsubResize?.();
        this.unsubResize = null;
        this.boardLayer.off("pointertap", this.onTap);
        this.clearAmbient();
        this.emitter.destroy();
        this.tweens.clear();
        this.dreamFilter.destroy();
        this.root.destroy({ children: true });
    }
}
