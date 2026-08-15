import assert from "node:assert/strict";
import { moveFromAuthoritativeTransition } from "../src/game/chess/authoritativeMove.ts";
import { fullCastling, startingBoard } from "../src/game/chess/board.ts";
import { applyMove } from "../src/game/chess/moves.ts";
import { CAPTURE_SHAKE_MAGNITUDE, moveShakeMagnitude } from "../src/game/scene/moveFeedback.ts";

assert.equal(moveShakeMagnitude(null), 0, "ordinary moves must not shake the board");
assert.equal(moveShakeMagnitude("p"), CAPTURE_SHAKE_MAGNITUDE, "captures keep a restrained impact shake");
assert.equal(moveShakeMagnitude("q"), CAPTURE_SHAKE_MAGNITUDE, "capture shake is independent of captured piece");

const beforeCapture = startingBoard();
beforeCapture[12] = null;
beforeCapture[28] = { color: "w", type: "p" };
beforeCapture[51] = null;
beforeCapture[35] = { color: "b", type: "p" };
const captured = applyMove(beforeCapture, fullCastling(), {
    from: 28,
    to: 35,
    piece: "p",
    color: "w",
    capture: "p",
    promotion: null,
    flags: "",
}).board;
const receivedCapture = moveFromAuthoritativeTransition(beforeCapture, captured, {
    from: 28,
    to: 35,
    promotion: null,
});
assert.equal(receivedCapture.capture, "p", "received multiplayer captures preserve their impact feedback");
assert.equal(moveShakeMagnitude(receivedCapture.capture), CAPTURE_SHAKE_MAGNITUDE);

console.log("move-feedback: ok");
