// Central configuration & tunable constants for the FOE game.
// Keeping these in one place makes balancing and troubleshooting easy.

export const PLAYERS = {
  YOU: 'YOU',
  CPU: 'CPU',
};

// Human-friendly labels used in the UI.
export const PLAYER_LABELS = {
  YOU: 'You',
  CPU: 'CPU',
};

// Available board sizes shown on the setup screen.
export const BOARD_SIZES = [
  { id: 5, label: 'Small', sub: '5 × 5' },
  { id: 8, label: 'Medium', sub: '8 × 8' },
  { id: 10, label: 'Large', sub: '10 × 10' },
];

// CPU difficulty options.
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', sub: 'Random moves' },
  { id: 'normal', label: 'Normal', sub: 'Remembers peeks' },
  { id: 'hard', label: 'Hard', sub: 'Plays for combos' },
];

// Timing (milliseconds).
export const TIMING = {
  REVEAL_MS: 1600, // how long peeked neighbour numbers stay visible
  CPU_DELAY_MS: 650, // pause before the CPU takes its turn (feels natural)
};

// Scoring / combo tuning.
//
// Each revealed number is EVEN or ODD, and may also be a FIVE (multiple of 5).
// Repeating the same parity builds a parity streak; multiples of 5 build a
// separate fives streak. Both feed a score multiplier.
export const SCORING = {
  BASE_POINTS: 10, // points for a plain reveal at 1.0x multiplier
  PARITY_STEP: 0.1, // multiplier gained per extra same-parity pick
  PARITY_CAP: 10, // max parity streak that contributes (=> +1.0 max)
  FIVE_STEP: 0.5, // multiplier gained per consecutive multiple-of-5
  FIVE_CAP: 4, // max fives streak that contributes (=> +2.0 max)
};

// Derived maxima used by the combo meters in the UI.
export const METER_MAX = {
  parity: SCORING.PARITY_CAP,
  five: SCORING.FIVE_CAP,
};

// Max multiplier is 1 + PARITY_CAP*PARITY_STEP + FIVE_CAP*FIVE_STEP.
export const MAX_MULTIPLIER =
  1 + SCORING.PARITY_CAP * SCORING.PARITY_STEP + SCORING.FIVE_CAP * SCORING.FIVE_STEP;

// How many recent picks to show in each player's history strip.
export const HISTORY_LIMIT = 12;
