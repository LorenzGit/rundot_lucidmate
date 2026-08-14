import type { CorrespondencePace, RivalIdentity } from "./model.ts";

export const RIVALS_ROOM_TYPE = "lucidmate-rivals";
export const RIVALS_DIRECTORY_KEY = "lucidmate-community-v1";

export interface RivalDirectoryProfile extends RivalIdentity {
    lastSeenAt: number;
}

export interface RivalInvitation {
    matchKey: string;
    pace: CorrespondencePace;
    roomCode: string | null;
    from: RivalIdentity;
    createdAt: number;
}

export type RivalsClientMessage =
    | { type: "refresh" }
    | { type: "search"; query: string }
    | {
          type: "challenge";
          requestId: string;
          targetProfileId: string;
          matchKey: string;
          pace: CorrespondencePace;
      }
    | { type: "acceptChallenge"; matchKey: string }
    | { type: "cancelChallenge"; matchKey: string; requestId?: string };

export type RivalsServerMessage =
    | {
          type: "directory";
          recommendations: RivalDirectoryProfile[];
          searchResults: RivalDirectoryProfile[];
          query: string;
          invitations: RivalInvitation[];
      }
    | { type: "challengeSent"; requestId: string; target: RivalIdentity }
    | { type: "challengeReceived"; invitation: RivalInvitation }
    | { type: "challengeRemoved"; matchKey: string; reason: "accepted" | "cancelled"; requestId?: string }
    | { type: "error"; requestId?: string; reason: string };

export type RivalsProtocol = RivalsClientMessage | RivalsServerMessage;
