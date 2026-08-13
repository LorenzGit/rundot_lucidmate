# Multiplayer measurement plan

- Decision and owner: validate that durable friend games create repeat play
  before expanding to open community discovery; game owner reviews.
- Primary metric: percentage of accepted friend challenges that reach move 4;
  target 55% after 200 accepted matches, reviewed 14 days after launch.
- Guardrails: notification opt-out, room/join errors, timeout rate, rematch rate,
  and no change to legal-move or outcome authority.
- Events: `correspondence_invite_shared`, `correspondence_link_opened`,
  `correspondence_match_started`, `correspondence_move_four`,
  `correspondence_match_finished`, `correspondence_reaction_sent`, and
  `correspondence_rematch_requested`; properties are pace, phase, route kind,
  and build version. Never emit profile names, IDs, invite keys, or board state.
- Funnel: invite shared → link opened → match reaches playing → move 4 → result →
  rematch. Cohort by pace and build version.
- Baseline: version 0.3.4; minimum 200 accepted matches and 50 results.
- Source: RUN analytics plus room-server error logs; analytics failure never
  affects chess or persistence.
- Experiment: none until baseline reaches the minimum sample.
- QA: two authenticated clients, persistent rejoin, server timeout, invite deep
  link, notification deep link, reaction allowlist, rematch, and ViewDeck gates.
