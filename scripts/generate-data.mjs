// Deterministic data generator for the Rut Prono WK 2026 app.
// Produces src/data/*.json: 48 teams in 12 groups, the full group-stage calendar
// (matchdays 1-3) + knockout bracket placeholders, matchday 1 & 2 results,
// 40 dummy contestants with predictions + bonus picks, and scorers.
//
// Run with: node scripts/generate-data.mjs
//
// NOTE: team -> group assignments are PLACEHOLDER dummy data (not the official
// FIFA draw). Dates/venues/structure follow the official WK 2026 schedule
// (see docs/schedule.md). Replace with real data before going live.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
mkdirSync(DATA, { recursive: true });

// ---- seeded RNG (mulberry32) so output is stable across runs ----
let seed = 20260611;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (n) => Math.floor(rand() * n);
const pick = (arr) => arr[randInt(arr.length)];

const GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// 48 teams: [slug, iso (flag-icons), Dutch name]. Group = index % 12 (spreads them).
const NATIONS = [
  ['mex', 'mx', 'Mexico'], ['can', 'ca', 'Canada'], ['usa', 'us', 'Verenigde Staten'], ['arg', 'ar', 'Argentinië'],
  ['bra', 'br', 'Brazilië'], ['fra', 'fr', 'Frankrijk'], ['eng', 'gb-eng', 'Engeland'], ['esp', 'es', 'Spanje'],
  ['ger', 'de', 'Duitsland'], ['por', 'pt', 'Portugal'], ['ned', 'nl', 'Nederland'], ['bel', 'be', 'België'],
  ['ita', 'it', 'Italië'], ['cro', 'hr', 'Kroatië'], ['uru', 'uy', 'Uruguay'], ['col', 'co', 'Colombia'],
  ['jpn', 'jp', 'Japan'], ['kor', 'kr', 'Zuid-Korea'], ['mar', 'ma', 'Marokko'], ['sen', 'sn', 'Senegal'],
  ['nga', 'ng', 'Nigeria'], ['gha', 'gh', 'Ghana'], ['cmr', 'cm', 'Kameroen'], ['egy', 'eg', 'Egypte'],
  ['civ', 'ci', 'Ivoorkust'], ['tun', 'tn', 'Tunesië'], ['aus', 'au', 'Australië'], ['irn', 'ir', 'Iran'],
  ['ksa', 'sa', 'Saoedi-Arabië'], ['qat', 'qa', 'Qatar'], ['ecu', 'ec', 'Ecuador'], ['per', 'pe', 'Peru'],
  ['chi', 'cl', 'Chili'], ['par', 'py', 'Paraguay'], ['sui', 'ch', 'Zwitserland'], ['den', 'dk', 'Denemarken'],
  ['pol', 'pl', 'Polen'], ['srb', 'rs', 'Servië'], ['aut', 'at', 'Oostenrijk'], ['swe', 'se', 'Zweden'],
  ['nor', 'no', 'Noorwegen'], ['sco', 'gb-sct', 'Schotland'], ['tur', 'tr', 'Turkije'], ['ukr', 'ua', 'Oekraïne'],
  ['gre', 'gr', 'Griekenland'], ['alg', 'dz', 'Algerije'], ['mli', 'ml', 'Mali'], ['nzl', 'nz', 'Nieuw-Zeeland'],
];

const VENUES = [
  'MetLife Stadium, New York', 'SoFi Stadium, Los Angeles', 'AT&T Stadium, Dallas', 'Mercedes-Benz Stadium, Atlanta',
  'NRG Stadium, Houston', 'Arrowhead Stadium, Kansas City', 'Hard Rock Stadium, Miami', 'Lincoln Financial Field, Philadelphia',
  'Levi\'s Stadium, San Francisco', 'Lumen Field, Seattle', 'Gillette Stadium, Boston', 'Estadio Azteca, Mexico-Stad',
  'Estadio Akron, Guadalajara', 'Estadio BBVA, Monterrey', 'BMO Field, Toronto', 'BC Place, Vancouver',
];

const teams = NATIONS.map(([id, iso, name], i) => ({ id, iso, name, group: GROUP_IDS[i % 12] }));
const groups = GROUP_IDS.map((g) => ({ id: g, teamIds: teams.filter((t) => t.group === g).map((t) => t.id) }));

// ---- realistic-ish scoreline ----
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4]; // skew low
const goals = () => pick(GOAL_WEIGHTS);

// ---- matches: group stage ----
let venueIdx = 0;
const nextVenue = () => VENUES[venueIdx++ % VENUES.length];
const pad = (n) => String(n).padStart(2, '0');
const kickoff = (day, hour) => `2026-06-${pad(day)}T${pad(hour)}:00:00+02:00`;

const matches = [];
// round-robin pairing for 4 teams [a,b,c,d]
const PAIRINGS = [
  [[0, 1], [2, 3]], // matchday 1
  [[0, 2], [3, 1]], // matchday 2
  [[3, 0], [1, 2]], // matchday 3
];

groups.forEach((group, gi) => {
  const t = group.teamIds;
  PAIRINGS.forEach((dayPairs, mdIdx) => {
    const matchday = mdIdx + 1;
    const baseDay = [11, 18, 24][mdIdx] + (gi % 4);
    dayPairs.forEach(([h, a], k) => {
      const finished = matchday <= 2; // md1 & md2 played, md3 to come
      const m = {
        id: `g${group.id}-md${matchday}-${k + 1}`,
        round: 'group',
        matchday,
        kickoff: kickoff(baseDay, k === 0 ? 18 : 21),
        venue: nextVenue(),
        homeTeamId: t[h],
        awayTeamId: t[a],
        status: finished ? 'finished' : 'scheduled',
      };
      if (finished) m.result = { home: goals(), away: goals() };
      matches.push(m);
    });
  });
});

// ---- matches: knockout bracket (placeholders) ----
// add `n` days to a YYYY-MM-DD base, returning a valid YYYY-MM-DD (rolls over months)
function dayPlus(base, n) {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function knockout(round, count, label, baseDate, perDay = 2) {
  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor(i / perDay);
    matches.push({
      id: `${round}-${i + 1}`,
      round,
      kickoff: `${dayPlus(baseDate, dayOffset)}T${i % 2 === 0 ? '18' : '21'}:00:00+02:00`,
      venue: nextVenue(),
      homeTeamId: null,
      awayTeamId: null,
      homePlaceholder: `${label} ${i * 2 + 1}`,
      awayPlaceholder: `${label} ${i * 2 + 2}`,
      status: 'scheduled',
    });
  }
}
knockout('r32', 16, 'Plaats', '2026-06-28', 3); // Jun 28 - Jul 3
knockout('r16', 8, 'Winnaar 1/16', '2026-07-04', 2); // Jul 4-7
knockout('qf', 4, 'Winnaar 1/8', '2026-07-09', 2); // Jul 9-10
knockout('sf', 2, 'Winnaar KF', '2026-07-14', 1); // Jul 14-15
// third place + final
matches.push({ id: 'third-1', round: 'third', kickoff: '2026-07-18T16:00:00+02:00', venue: VENUES[0], homeTeamId: null, awayTeamId: null, homePlaceholder: 'Verliezer HF 1', awayPlaceholder: 'Verliezer HF 2', status: 'scheduled' });
matches.push({ id: 'final-1', round: 'final', kickoff: '2026-07-19T17:00:00+02:00', venue: 'MetLife Stadium, New York', homeTeamId: null, awayTeamId: null, homePlaceholder: 'Winnaar HF 1', awayPlaceholder: 'Winnaar HF 2', status: 'scheduled' });

// ---- participants (40 dummy) ----
const NAMES = [
  'Hakke', 'Ruub', 'Bram', 'An', 'Stijn', 'Lotte', 'Wout', 'Jens', 'Sven', 'Maarten',
  'Ellen', 'Tom', 'Niels', 'Koen', 'Bart', 'Lien', 'Dries', 'Pieter', 'Jonas', 'Kobe',
  'Senne', 'Lars', 'Thomas', 'Robbe', 'Seppe', 'Milan', 'Vince', 'Arne', 'Ward', 'Jasper',
  'Gilles', 'Mathias', 'Karel', 'Lukas', 'Femke', 'Sara', 'Joris', 'Glenn', 'Yves', 'Dirk',
];
const PLAYERS = [
  'Kylian Mbappé', 'Harry Kane', 'Vinícius Júnior', 'Erling Haaland', 'Lautaro Martínez',
  'Kevin De Bruyne', 'Lamine Yamal', 'Jude Bellingham', 'Rafael Leão', 'Victor Osimhen',
  'Cristiano Ronaldo', 'Heung-min Son', 'Achraf Hakimi', 'Julián Álvarez', 'Phil Foden',
  'Federico Valverde', 'Cody Gakpo', 'Romelu Lukaku', 'Khvicha Kvaratskhelia', 'Bukayo Saka',
];

const seen = new Set();
const usedSlug = (name) => {
  let s = name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  let slug = s, n = 2;
  while (seen.has(slug)) slug = `${s}${n++}`;
  seen.add(slug);
  return slug;
};

const teamIds = teams.map((t) => t.id);
const participants = NAMES.map((name) => ({
  id: usedSlug(name),
  name,
  bonus: {
    topScorer: pick(PLAYERS),
    winnerTeamId: pick(teamIds),
    mostConcededTeamId: pick(teamIds),
    mostScoredTeamId: pick(teamIds),
  },
}));

// ---- predictions: every contestant predicts every group match ----
const predictions = [];
for (const p of participants) {
  for (const m of matches) {
    if (m.round !== 'group') continue;
    predictions.push({ participantId: p.id, matchId: m.id, home: goals(), away: goals() });
  }
}

// ---- scorers ----
const scorers = PLAYERS.slice(0, 16).map((player) => ({
  player,
  teamId: pick(teamIds),
  goals: 1 + randInt(5),
})).sort((a, b) => b.goals - a.goals);

// ---- outcomes (tournament ongoing -> unknown) ----
const outcomes = { topScorer: '', winnerTeamId: '', mostConcededTeamId: '', mostScoredTeamId: '' };

const settings = {
  multipliers: { group: 1, r32: 2, r16: 3, qf: 4, sf: 4, third: 4, final: 5 },
  bonusPoints: 30,
};

const write = (name, data) => writeFileSync(join(DATA, name), JSON.stringify(data, null, 2) + '\n');
write('teams.json', teams);
write('groups.json', groups);
write('matches.json', matches);
write('participants.json', participants);
write('predictions.json', predictions);
write('scorers.json', scorers);
write('outcomes.json', outcomes);
write('settings.json', settings);

console.log(`Generated: ${teams.length} teams, ${groups.length} groups, ${matches.length} matches, ${participants.length} contestants, ${predictions.length} predictions.`);
