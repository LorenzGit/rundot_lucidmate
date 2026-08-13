/**
 * React ↔ Pixi boundary. React owns WHEN the board exists; Pixi owns the paint.
 */
import type { Application } from "pixi.js";
import { useEffect, useRef } from "react";
import {
    acquireRendererRuntime,
    type RendererLease,
    type RendererLifecycleScope,
} from "../rendering/rendererLifecycle.ts";
import { getFrameSafeArea } from "../sdk/runSdk.ts";
import { store, useStore } from "../state/store.ts";
import { createPixiApp } from "./pixiApp.ts";
import { RunController } from "./runController.ts";
import type { Insets } from "./scene/layout.ts";
import { ChessScene } from "./scene/chessScene.ts";
import { createStage, type Stage } from "./stage.ts";

interface BenchRuntime {
    app: Application;
    scene: ChessScene;
    controller: RunController;
}

let activeController: RunController | null = null;
let activeScene: ChessScene | null = null;
let syncInsets: (() => void) | null = null;

export function resyncSceneInsets(): void {
    syncInsets?.();
}

export function getRunController(): RunController | null {
    return activeController;
}

export function getChessScene(): ChessScene | null {
    return activeScene;
}

function designInsets(scale: number): Insets {
    const raw = getFrameSafeArea();
    return {
        top: raw.top / scale,
        right: raw.right / scale,
        bottom: raw.bottom / scale,
        left: raw.left / scale,
    };
}

async function initializeBench(scope: RendererLifecycleScope, host: HTMLElement): Promise<BenchRuntime> {
    const app = await createPixiApp(scope, host);
    scope.throwIfCancelled();

    const stage: Stage = createStage(app);
    scope.manage(() => stage.destroy());

    const state = store.get();
    const controller = new RunController({
        playerColor: state.playerColor,
        opponent: state.opponentMode,
        difficulty: state.difficulty,
    });
    const scene = new ChessScene({
        app,
        stage,
        match: controller.match,
        themeId: state.selectedTheme,
        reducedMotion: state.reducedMotion,
        quality: state.quality,
        insets: designInsets(stage.scale()),
        callbacks: controller.sceneCallbacks,
    });
    scope.manage(() => {
        controller.detach();
        if (activeController === controller) activeController = null;
        if (activeScene === scene) activeScene = null;
        scene.destroy();
    });

    controller.attach(scene);
    activeController = controller;
    activeScene = scene;

    const sync = () => scene.setInsets(designInsets(stage.scale()));
    scope.manage(stage.onResize(sync));
    syncInsets = sync;
    scope.manage(() => {
        if (syncInsets === sync) syncInsets = null;
    });

    if (store.get().paused || document.hidden) app.ticker.stop();
    return { app, scene, controller };
}

export default function GameCanvas() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const sceneRef = useRef<ChessScene | null>(null);
    const paused = useStore((s) => s.paused);
    const reducedMotion = useStore((s) => s.reducedMotion);
    const themeId = useStore((s) => s.selectedTheme);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const abortController = new AbortController();
        let lease: RendererLease<BenchRuntime> | null = null;

        void acquireRendererRuntime("pixi-bench", abortController.signal, (scope) => initializeBench(scope, host))
            .then((nextLease) => {
                lease = nextLease;
                appRef.current = nextLease.value.app;
                sceneRef.current = nextLease.value.scene;
            })
            .catch((error: unknown) => {
                if (abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                    return;
                }
                console.error("[renderer] Pixi initialization failed", error);
                store.patch({
                    phase: "menu",
                    menuScreen: "main",
                    toast: "RENDERER UNAVAILABLE — TRY A DIFFERENT DEVICE",
                });
            });

        return () => {
            abortController.abort();
            appRef.current = null;
            sceneRef.current = null;
            void lease?.release();
        };
    }, []);

    useEffect(() => {
        const app = appRef.current;
        if (!app) return;
        if (paused || document.hidden) app.ticker.stop();
        else app.ticker.start();
        activeScene?.setPaused(paused);
    }, [paused]);

    useEffect(() => {
        const syncVisibility = () => {
            const app = appRef.current;
            if (!app) return;
            if (document.hidden || store.get().paused) app.ticker.stop();
            else app.ticker.start();
        };
        document.addEventListener("visibilitychange", syncVisibility);
        return () => document.removeEventListener("visibilitychange", syncVisibility);
    }, []);

    useEffect(() => {
        sceneRef.current?.setReducedMotion(reducedMotion);
    }, [reducedMotion]);

    useEffect(() => {
        sceneRef.current?.setTheme(themeId);
    }, [themeId]);

    return <div ref={hostRef} className="absolute inset-0" role="img" aria-label="Lucidmate chess board" />;
}
