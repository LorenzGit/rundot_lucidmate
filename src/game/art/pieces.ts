/**
 * Procedural chess pieces drawn with Pixi Graphics.
 * No external art files — silhouettes with soft shadows and chrome outlines.
 */
import { Container, Graphics } from "pixi.js";
import type { Color, PieceType } from "../chess/types.ts";
import type { TripTheme } from "./palette.ts";

export function createPieceGraphic(type: PieceType, color: Color, theme: TripTheme, cellSize: number): Container {
    const root = new Container();
    const g = new Graphics();
    const isWhite = color === "w";
    const fill = isWhite ? theme.whitePiece : theme.blackPiece;
    // Near-black outline; white pieces get a thicker ring so ivory never melts
    // into mid-tone light squares.
    const stroke = theme.outline;
    const s = cellSize;
    const line = Math.max(isWhite ? 2.8 : 1.5, s * (isWhite ? 0.072 : 0.04));

    // Soft drop-shadow so pieces separate from any square color
    const shadow = new Graphics();
    shadow.ellipse(0, s * 0.3, s * 0.3, s * 0.11);
    shadow.fill({ color: 0x000000, alpha: isWhite ? 0.45 : 0.35 });
    root.addChild(shadow);

    // White pieces: dark under-halo behind the silhouette for extra punch.
    if (isWhite) {
        const halo = new Graphics();
        halo.ellipse(0, s * 0.02, s * 0.3, s * 0.34);
        halo.fill({ color: stroke, alpha: 0.22 });
        root.addChild(halo);
    }

    // Base pedestal shared by all pieces
    g.roundRect(-s * 0.28, s * 0.22, s * 0.56, s * 0.12, s * 0.04);
    g.fill({ color: fill, alpha: 1 });
    g.stroke({ width: line * 1.2, color: stroke, alpha: 1 });

    switch (type) {
        case "p":
            drawPawn(g, fill, stroke, s, line);
            break;
        case "n":
            drawKnight(g, fill, stroke, s, line);
            break;
        case "b":
            drawBishop(g, fill, stroke, s, line);
            break;
        case "r":
            drawRook(g, fill, stroke, s, line);
            break;
        case "q":
            drawQueen(g, fill, stroke, s, line);
            break;
        case "k":
            drawKing(g, fill, stroke, s, line);
            break;
    }

    // Accent jewel — skip on knight; the eye is the recognisable detail there.
    if (type !== "n") {
        const jewel = new Graphics();
        jewel.circle(0, type === "p" ? -s * 0.05 : -s * 0.18, s * 0.06);
        jewel.fill({ color: theme.accent, alpha: 1 });
        jewel.stroke({ width: Math.max(1, line * 0.55), color: stroke, alpha: 0.95 });
        root.addChild(g);
        root.addChild(jewel);
    } else {
        root.addChild(g);
    }
    return root;
}

function drawPawn(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    g.circle(0, -s * 0.05, s * 0.14);
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.9 });
    g.moveTo(-s * 0.16, s * 0.18);
    g.quadraticCurveTo(0, s * 0.02, s * 0.16, s * 0.18);
    g.lineTo(-s * 0.16, s * 0.18);
    g.fill({ color: fill, alpha: 0.95 });
}

/**
 * Classic chess knight: horse head in profile facing right.
 * Neck, mane, ear, snout, jaw — readable at small cell sizes.
 */
function drawKnight(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    // Body / neck / head silhouette (single filled path)
    g.moveTo(-s * 0.12, s * 0.2); // base left
    g.lineTo(-s * 0.2, s * 0.08); // left neck out
    g.quadraticCurveTo(-s * 0.28, -s * 0.02, -s * 0.2, -s * 0.12); // mane back
    g.lineTo(-s * 0.16, -s * 0.22); // mane top
    g.lineTo(-s * 0.06, -s * 0.3); // ear tip
    g.lineTo(s * 0.02, -s * 0.24); // forehead
    g.quadraticCurveTo(s * 0.18, -s * 0.2, s * 0.26, -s * 0.08); // nose bridge
    g.lineTo(s * 0.28, -s * 0.0); // snout tip
    g.lineTo(s * 0.18, s * 0.02); // mouth under
    g.quadraticCurveTo(s * 0.08, s * 0.0, s * 0.0, s * 0.04); // jaw
    g.lineTo(-s * 0.02, s * 0.12); // throat
    g.lineTo(s * 0.06, s * 0.2); // base right
    g.closePath();
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.95 });

    // Mane notch (reads as hair even at tiny sizes)
    g.moveTo(-s * 0.18, -s * 0.08);
    g.lineTo(-s * 0.1, -s * 0.18);
    g.lineTo(-s * 0.14, -s * 0.04);
    g.closePath();
    g.fill({ color: fill });
    g.stroke({ width: line * 0.7, color: stroke, alpha: 0.8 });

    // Ear inner tick
    g.moveTo(-s * 0.04, -s * 0.26);
    g.lineTo(s * 0.0, -s * 0.2);
    g.stroke({ width: line * 0.75, color: stroke, alpha: 0.85 });

    // Eye
    g.circle(s * 0.06, -s * 0.12, s * 0.032);
    g.fill({ color: stroke, alpha: 0.95 });

    // Nostril
    g.circle(s * 0.22, -s * 0.04, s * 0.02);
    g.fill({ color: stroke, alpha: 0.7 });

    // Jaw line
    g.moveTo(s * 0.02, s * 0.0);
    g.lineTo(s * 0.16, -s * 0.02);
    g.stroke({ width: line * 0.65, color: stroke, alpha: 0.55 });
}

function drawBishop(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    g.ellipse(0, -s * 0.08, s * 0.14, s * 0.26);
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.9 });
    g.moveTo(-s * 0.04, -s * 0.28);
    g.lineTo(s * 0.04, -s * 0.28);
    g.lineTo(0, -s * 0.36);
    g.closePath();
    g.fill({ color: fill });
    // Mitre slit
    g.moveTo(s * 0.02, -s * 0.22);
    g.lineTo(-s * 0.06, s * 0.02);
    g.stroke({ width: line * 0.8, color: stroke, alpha: 0.7 });
}

function drawRook(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    g.roundRect(-s * 0.18, -s * 0.08, s * 0.36, s * 0.3, s * 0.02);
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.9 });
    // Battlements
    for (const x of [-0.18, -0.04, 0.1]) {
        g.rect(s * x, -s * 0.22, s * 0.1, s * 0.14);
        g.fill({ color: fill });
        g.stroke({ width: line * 0.7, color: stroke, alpha: 0.8 });
    }
}

function drawQueen(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    g.moveTo(-s * 0.22, s * 0.18);
    g.lineTo(-s * 0.2, -s * 0.05);
    g.lineTo(-s * 0.14, -s * 0.22);
    g.lineTo(-s * 0.05, -s * 0.1);
    g.lineTo(0, -s * 0.3);
    g.lineTo(s * 0.05, -s * 0.1);
    g.lineTo(s * 0.14, -s * 0.22);
    g.lineTo(s * 0.2, -s * 0.05);
    g.lineTo(s * 0.22, s * 0.18);
    g.closePath();
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.9 });
    g.circle(0, -s * 0.32, s * 0.05);
    g.fill({ color: fill });
    g.stroke({ width: line * 0.8, color: stroke, alpha: 0.9 });
}

function drawKing(g: Graphics, fill: number, stroke: number, s: number, line: number): void {
    g.roundRect(-s * 0.16, -s * 0.05, s * 0.32, s * 0.28, s * 0.04);
    g.fill({ color: fill });
    g.stroke({ width: line, color: stroke, alpha: 0.9 });
    // Cross
    g.rect(-s * 0.035, -s * 0.32, s * 0.07, s * 0.28);
    g.fill({ color: fill });
    g.stroke({ width: line * 0.7, color: stroke, alpha: 0.85 });
    g.rect(-s * 0.12, -s * 0.24, s * 0.24, s * 0.07);
    g.fill({ color: fill });
    g.stroke({ width: line * 0.7, color: stroke, alpha: 0.85 });
}
