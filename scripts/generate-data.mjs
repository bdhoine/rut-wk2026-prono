// Deterministic data generator for the Rut Prono WK 2026 app.
// Uses the REAL 2026 FIFA World Cup draw + fixture schedule (group stage + knockout
// slots). Kickoffs are stored as ISO strings with each venue's real UTC offset, so
// the frontend (which formats in Europe/Brussels) shows Belgium time.
//
// Results for matchdays 1 & 2 are simulated (realistic scorelines); matchday 3 and
// the knockout bracket are still to come. Predictions are simulated per contestant
// with a skill level so the ranking spreads naturally. Contestants are dummy.
//
// Run: node scripts/generate-data.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
mkdirSync(DATA, { recursive: true });

// ---- seeded RNG (mulberry32) ----
let seed = 20260611;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (n) => Math.floor(rand() * n);
const pick = (arr) => arr[randInt(arr.length)];

// ---- teams: [group, English name, iso, Dutch name] (real draw) ----
const NATIONS = [
  ['A', 'Mexico', 'mx', 'Mexico'], ['A', 'South Africa', 'za', 'Zuid-Afrika'], ['A', 'South Korea', 'kr', 'Zuid-Korea'], ['A', 'Czech Republic', 'cz', 'Tsjechië'],
  ['B', 'Canada', 'ca', 'Canada'], ['B', 'Bosnia and Herzegovina', 'ba', 'Bosnië-Herzegovina'], ['B', 'Qatar', 'qa', 'Qatar'], ['B', 'Switzerland', 'ch', 'Zwitserland'],
  ['C', 'Brazil', 'br', 'Brazilië'], ['C', 'Morocco', 'ma', 'Marokko'], ['C', 'Haiti', 'ht', 'Haïti'], ['C', 'Scotland', 'gb-sct', 'Schotland'],
  ['D', 'United States', 'us', 'Verenigde Staten'], ['D', 'Paraguay', 'py', 'Paraguay'], ['D', 'Australia', 'au', 'Australië'], ['D', 'Turkey', 'tr', 'Turkije'],
  ['E', 'Germany', 'de', 'Duitsland'], ['E', 'Curacao', 'cw', 'Curaçao'], ['E', 'Ivory Coast', 'ci', 'Ivoorkust'], ['E', 'Ecuador', 'ec', 'Ecuador'],
  ['F', 'Netherlands', 'nl', 'Nederland'], ['F', 'Japan', 'jp', 'Japan'], ['F', 'Sweden', 'se', 'Zweden'], ['F', 'Tunisia', 'tn', 'Tunesië'],
  ['G', 'Belgium', 'be', 'België'], ['G', 'Egypt', 'eg', 'Egypte'], ['G', 'Iran', 'ir', 'Iran'], ['G', 'New Zealand', 'nz', 'Nieuw-Zeeland'],
  ['H', 'Spain', 'es', 'Spanje'], ['H', 'Cape Verde', 'cv', 'Kaapverdië'], ['H', 'Saudi Arabia', 'sa', 'Saoedi-Arabië'], ['H', 'Uruguay', 'uy', 'Uruguay'],
  ['I', 'France', 'fr', 'Frankrijk'], ['I', 'Senegal', 'sn', 'Senegal'], ['I', 'Iraq', 'iq', 'Irak'], ['I', 'Norway', 'no', 'Noorwegen'],
  ['J', 'Argentina', 'ar', 'Argentinië'], ['J', 'Algeria', 'dz', 'Algerije'], ['J', 'Austria', 'at', 'Oostenrijk'], ['J', 'Jordan', 'jo', 'Jordanië'],
  ['K', 'Portugal', 'pt', 'Portugal'], ['K', 'DR Congo', 'cd', 'DR Congo'], ['K', 'Uzbekistan', 'uz', 'Oezbekistan'], ['K', 'Colombia', 'co', 'Colombia'],
  ['L', 'England', 'gb-eng', 'Engeland'], ['L', 'Croatia', 'hr', 'Kroatië'], ['L', 'Ghana', 'gh', 'Ghana'], ['L', 'Panama', 'pa', 'Panama'],
];

const idOf = (iso) => iso.replace('-', '');
const teams = NATIONS.map(([group, en, iso, nl]) => ({ id: idOf(iso), iso, name: nl, group, en }));
const byEnglish = new Map(teams.map((t) => [t.en, t.id]));
// strip the helper `en` field from the persisted teams
const teamsOut = teams.map(({ en, ...t }) => t);

const GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const groups = GROUP_IDS.map((g) => ({ id: g, teamIds: teams.filter((t) => t.group === g).map((t) => t.id) }));

// ---- venues: host city -> { offset (June, local), label } ----
const CITY = {
  'Mexico City': ['-06:00', 'Estadio Azteca, Mexico-Stad'],
  'Zapopan': ['-06:00', 'Estadio Akron, Guadalajara'],
  'Guadalupe': ['-06:00', 'Estadio BBVA, Monterrey'],
  'Atlanta': ['-04:00', 'Mercedes-Benz Stadium, Atlanta'],
  'East Rutherford': ['-04:00', 'MetLife Stadium, New York'],
  'Foxborough': ['-04:00', 'Gillette Stadium, Boston'],
  'Philadelphia': ['-04:00', 'Lincoln Financial Field, Philadelphia'],
  'Miami Gardens': ['-04:00', 'Hard Rock Stadium, Miami'],
  'Toronto': ['-04:00', 'BMO Field, Toronto'],
  'Houston': ['-05:00', 'NRG Stadium, Houston'],
  'Kansas City': ['-05:00', 'Arrowhead Stadium, Kansas City'],
  'Arlington': ['-05:00', 'AT&T Stadium, Dallas'],
  'Inglewood': ['-07:00', 'SoFi Stadium, Los Angeles'],
  'Santa Clara': ['-07:00', "Levi's Stadium, San Francisco"],
  'Seattle': ['-07:00', 'Lumen Field, Seattle'],
  'Vancouver': ['-07:00', 'BC Place, Vancouver'],
};
const kickoff = (date, time, city) => `${date}T${time}:00${CITY[city][0]}`;
const venueOf = (city) => CITY[city][1];

// ---- group fixtures: [group, matchday, date, localTime, city, homeEN, awayEN] ----
const GROUP_FIXTURES = [
  ['A', 1, '2026-06-11', '13:00', 'Mexico City', 'Mexico', 'South Africa'],
  ['A', 1, '2026-06-11', '20:00', 'Zapopan', 'South Korea', 'Czech Republic'],
  ['A', 2, '2026-06-18', '12:00', 'Atlanta', 'Czech Republic', 'South Africa'],
  ['A', 2, '2026-06-18', '19:00', 'Zapopan', 'Mexico', 'South Korea'],
  ['A', 3, '2026-06-24', '19:00', 'Mexico City', 'Czech Republic', 'Mexico'],
  ['A', 3, '2026-06-24', '19:00', 'Guadalupe', 'South Africa', 'South Korea'],
  ['B', 1, '2026-06-12', '15:00', 'Toronto', 'Canada', 'Bosnia and Herzegovina'],
  ['B', 1, '2026-06-13', '12:00', 'Santa Clara', 'Qatar', 'Switzerland'],
  ['B', 2, '2026-06-18', '12:00', 'Inglewood', 'Switzerland', 'Bosnia and Herzegovina'],
  ['B', 2, '2026-06-18', '15:00', 'Vancouver', 'Canada', 'Qatar'],
  ['B', 3, '2026-06-24', '12:00', 'Vancouver', 'Switzerland', 'Canada'],
  ['B', 3, '2026-06-24', '12:00', 'Seattle', 'Bosnia and Herzegovina', 'Qatar'],
  ['C', 1, '2026-06-13', '18:00', 'East Rutherford', 'Brazil', 'Morocco'],
  ['C', 1, '2026-06-13', '21:00', 'Foxborough', 'Haiti', 'Scotland'],
  ['C', 2, '2026-06-19', '18:00', 'Foxborough', 'Scotland', 'Morocco'],
  ['C', 2, '2026-06-19', '20:30', 'Philadelphia', 'Brazil', 'Haiti'],
  ['C', 3, '2026-06-24', '18:00', 'Miami Gardens', 'Scotland', 'Brazil'],
  ['C', 3, '2026-06-24', '18:00', 'Atlanta', 'Morocco', 'Haiti'],
  ['D', 1, '2026-06-12', '18:00', 'Inglewood', 'United States', 'Paraguay'],
  ['D', 1, '2026-06-13', '21:00', 'Vancouver', 'Australia', 'Turkey'],
  ['D', 2, '2026-06-19', '12:00', 'Seattle', 'United States', 'Australia'],
  ['D', 2, '2026-06-19', '20:00', 'Santa Clara', 'Turkey', 'Paraguay'],
  ['D', 3, '2026-06-25', '19:00', 'Inglewood', 'Turkey', 'United States'],
  ['D', 3, '2026-06-25', '19:00', 'Santa Clara', 'Paraguay', 'Australia'],
  ['E', 1, '2026-06-14', '12:00', 'Houston', 'Germany', 'Curacao'],
  ['E', 1, '2026-06-14', '19:00', 'Philadelphia', 'Ivory Coast', 'Ecuador'],
  ['E', 2, '2026-06-20', '16:00', 'Toronto', 'Germany', 'Ivory Coast'],
  ['E', 2, '2026-06-20', '19:00', 'Kansas City', 'Ecuador', 'Curacao'],
  ['E', 3, '2026-06-25', '16:00', 'Philadelphia', 'Curacao', 'Ivory Coast'],
  ['E', 3, '2026-06-25', '16:00', 'East Rutherford', 'Ecuador', 'Germany'],
  ['F', 1, '2026-06-14', '15:00', 'Arlington', 'Netherlands', 'Japan'],
  ['F', 1, '2026-06-14', '20:00', 'Guadalupe', 'Sweden', 'Tunisia'],
  ['F', 2, '2026-06-20', '12:00', 'Houston', 'Netherlands', 'Sweden'],
  ['F', 2, '2026-06-20', '22:00', 'Guadalupe', 'Tunisia', 'Japan'],
  ['F', 3, '2026-06-25', '18:00', 'Arlington', 'Japan', 'Sweden'],
  ['F', 3, '2026-06-25', '18:00', 'Kansas City', 'Tunisia', 'Netherlands'],
  ['G', 1, '2026-06-15', '12:00', 'Seattle', 'Belgium', 'Egypt'],
  ['G', 1, '2026-06-15', '18:00', 'Inglewood', 'Iran', 'New Zealand'],
  ['G', 2, '2026-06-21', '12:00', 'Inglewood', 'Belgium', 'Iran'],
  ['G', 2, '2026-06-21', '18:00', 'Vancouver', 'New Zealand', 'Egypt'],
  ['G', 3, '2026-06-26', '20:00', 'Seattle', 'Egypt', 'Iran'],
  ['G', 3, '2026-06-26', '20:00', 'Vancouver', 'New Zealand', 'Belgium'],
  ['H', 1, '2026-06-15', '12:00', 'Atlanta', 'Spain', 'Cape Verde'],
  ['H', 1, '2026-06-15', '18:00', 'Miami Gardens', 'Saudi Arabia', 'Uruguay'],
  ['H', 2, '2026-06-21', '12:00', 'Atlanta', 'Spain', 'Saudi Arabia'],
  ['H', 2, '2026-06-21', '18:00', 'Miami Gardens', 'Uruguay', 'Cape Verde'],
  ['H', 3, '2026-06-26', '19:00', 'Houston', 'Cape Verde', 'Saudi Arabia'],
  ['H', 3, '2026-06-26', '18:00', 'Zapopan', 'Uruguay', 'Spain'],
  ['I', 1, '2026-06-16', '15:00', 'East Rutherford', 'France', 'Senegal'],
  ['I', 1, '2026-06-16', '18:00', 'Foxborough', 'Iraq', 'Norway'],
  ['I', 2, '2026-06-22', '17:00', 'Philadelphia', 'France', 'Iraq'],
  ['I', 2, '2026-06-22', '20:00', 'East Rutherford', 'Norway', 'Senegal'],
  ['I', 3, '2026-06-26', '15:00', 'Foxborough', 'Norway', 'France'],
  ['I', 3, '2026-06-26', '15:00', 'Toronto', 'Senegal', 'Iraq'],
  ['J', 1, '2026-06-16', '20:00', 'Kansas City', 'Argentina', 'Algeria'],
  ['J', 1, '2026-06-16', '21:00', 'Santa Clara', 'Austria', 'Jordan'],
  ['J', 2, '2026-06-22', '12:00', 'Arlington', 'Argentina', 'Austria'],
  ['J', 2, '2026-06-22', '20:00', 'Santa Clara', 'Jordan', 'Algeria'],
  ['J', 3, '2026-06-27', '21:00', 'Kansas City', 'Algeria', 'Austria'],
  ['J', 3, '2026-06-27', '21:00', 'Arlington', 'Jordan', 'Argentina'],
  ['K', 1, '2026-06-17', '12:00', 'Houston', 'Portugal', 'DR Congo'],
  ['K', 1, '2026-06-17', '20:00', 'Mexico City', 'Uzbekistan', 'Colombia'],
  ['K', 2, '2026-06-23', '12:00', 'Houston', 'Portugal', 'Uzbekistan'],
  ['K', 2, '2026-06-23', '20:00', 'Zapopan', 'Colombia', 'DR Congo'],
  ['K', 3, '2026-06-27', '19:30', 'Miami Gardens', 'Colombia', 'Portugal'],
  ['K', 3, '2026-06-27', '19:30', 'Atlanta', 'DR Congo', 'Uzbekistan'],
  ['L', 1, '2026-06-17', '15:00', 'Arlington', 'England', 'Croatia'],
  ['L', 1, '2026-06-17', '19:00', 'Toronto', 'Ghana', 'Panama'],
  ['L', 2, '2026-06-23', '16:00', 'Foxborough', 'England', 'Ghana'],
  ['L', 2, '2026-06-23', '19:00', 'Toronto', 'Panama', 'Croatia'],
  ['L', 3, '2026-06-27', '17:00', 'East Rutherford', 'Panama', 'England'],
  ['L', 3, '2026-06-27', '17:00', 'Philadelphia', 'Croatia', 'Ghana'],
];

// ---- knockout slots: [round, date, city, homePlaceholder, awayPlaceholder] ----
const KO = [
  ['r32', '2026-06-28', 'Inglewood', '2e Groep A', '2e Groep B'],
  ['r32', '2026-06-29', 'Foxborough', 'Winnaar Groep E', 'Beste 3e (A/B/C/D/F)'],
  ['r32', '2026-06-29', 'Guadalupe', 'Winnaar Groep F', '2e Groep C'],
  ['r32', '2026-06-29', 'Houston', 'Winnaar Groep C', '2e Groep F'],
  ['r32', '2026-06-30', 'East Rutherford', 'Winnaar Groep I', 'Beste 3e (C/D/F/G/H)'],
  ['r32', '2026-06-30', 'Arlington', '2e Groep E', '2e Groep I'],
  ['r32', '2026-06-30', 'Mexico City', 'Winnaar Groep A', 'Beste 3e (C/E/F/H/I)'],
  ['r32', '2026-07-01', 'Atlanta', 'Winnaar Groep L', 'Beste 3e (E/H/I/J/K)'],
  ['r32', '2026-07-01', 'Santa Clara', 'Winnaar Groep D', 'Beste 3e (B/E/F/I/J)'],
  ['r32', '2026-07-01', 'Seattle', 'Winnaar Groep G', 'Beste 3e (A/E/H/I/J)'],
  ['r32', '2026-07-02', 'Toronto', '2e Groep K', '2e Groep L'],
  ['r32', '2026-07-02', 'Inglewood', 'Winnaar Groep H', '2e Groep J'],
  ['r32', '2026-07-02', 'Vancouver', 'Winnaar Groep B', 'Beste 3e (E/F/G/I/J)'],
  ['r32', '2026-07-03', 'Miami Gardens', 'Winnaar Groep J', '2e Groep H'],
  ['r32', '2026-07-03', 'Kansas City', 'Winnaar Groep K', 'Beste 3e (D/E/I/J/L)'],
  ['r32', '2026-07-03', 'Arlington', '2e Groep D', '2e Groep G'],
  ['r16', '2026-07-04', 'Philadelphia', 'Winnaar R32-2', 'Winnaar R32-5'],
  ['r16', '2026-07-04', 'Houston', 'Winnaar R32-1', 'Winnaar R32-3'],
  ['r16', '2026-07-05', 'East Rutherford', 'Winnaar R32-4', 'Winnaar R32-6'],
  ['r16', '2026-07-05', 'Mexico City', 'Winnaar R32-7', 'Winnaar R32-8'],
  ['r16', '2026-07-06', 'Arlington', 'Winnaar R32-11', 'Winnaar R32-12'],
  ['r16', '2026-07-06', 'Seattle', 'Winnaar R32-9', 'Winnaar R32-10'],
  ['r16', '2026-07-07', 'Atlanta', 'Winnaar R32-14', 'Winnaar R32-16'],
  ['r16', '2026-07-07', 'Vancouver', 'Winnaar R32-13', 'Winnaar R32-15'],
  ['qf', '2026-07-09', 'Foxborough', 'Winnaar 1/8 1', 'Winnaar 1/8 2'],
  ['qf', '2026-07-10', 'Inglewood', 'Winnaar 1/8 5', 'Winnaar 1/8 6'],
  ['qf', '2026-07-11', 'Miami Gardens', 'Winnaar 1/8 3', 'Winnaar 1/8 4'],
  ['qf', '2026-07-11', 'Kansas City', 'Winnaar 1/8 7', 'Winnaar 1/8 8'],
  ['sf', '2026-07-14', 'Arlington', 'Winnaar KF 1', 'Winnaar KF 2'],
  ['sf', '2026-07-15', 'Atlanta', 'Winnaar KF 3', 'Winnaar KF 4'],
  ['third', '2026-07-18', 'Miami Gardens', 'Verliezer HF 1', 'Verliezer HF 2'],
  ['final', '2026-07-19', 'East Rutherford', 'Winnaar HF 1', 'Winnaar HF 2'],
];
const KO_TIME = ['18:00', '21:00'];

// ---- realistic results for matchdays 1 & 2 (hand-crafted by team strength) ----
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const MD12_RESULTS = [
  // MD1
  ['Mexico', 'South Africa', 2, 1], ['South Korea', 'Czech Republic', 1, 1],
  ['Canada', 'Bosnia and Herzegovina', 1, 0], ['Qatar', 'Switzerland', 0, 3],
  ['Brazil', 'Morocco', 2, 0], ['Haiti', 'Scotland', 0, 2],
  ['United States', 'Paraguay', 2, 1], ['Australia', 'Turkey', 1, 1],
  ['Germany', 'Curacao', 3, 0], ['Ivory Coast', 'Ecuador', 1, 1],
  ['Netherlands', 'Japan', 2, 1], ['Sweden', 'Tunisia', 1, 0],
  ['Belgium', 'Egypt', 2, 0], ['Iran', 'New Zealand', 1, 0],
  ['Spain', 'Cape Verde', 3, 0], ['Saudi Arabia', 'Uruguay', 0, 2],
  ['France', 'Senegal', 2, 0], ['Iraq', 'Norway', 0, 2],
  ['Argentina', 'Algeria', 3, 0], ['Austria', 'Jordan', 2, 0],
  ['Portugal', 'DR Congo', 2, 0], ['Uzbekistan', 'Colombia', 0, 1],
  ['England', 'Croatia', 2, 0], ['Ghana', 'Panama', 1, 1],
  // MD2
  ['Czech Republic', 'South Africa', 1, 0], ['Mexico', 'South Korea', 1, 1],
  ['Switzerland', 'Bosnia and Herzegovina', 2, 1], ['Canada', 'Qatar', 2, 0],
  ['Scotland', 'Morocco', 0, 1], ['Brazil', 'Haiti', 4, 1],
  ['United States', 'Australia', 1, 1], ['Turkey', 'Paraguay', 2, 0],
  ['Germany', 'Ivory Coast', 2, 0], ['Ecuador', 'Curacao', 2, 0],
  ['Netherlands', 'Sweden', 3, 1], ['Tunisia', 'Japan', 0, 1],
  ['Belgium', 'Iran', 3, 1], ['New Zealand', 'Egypt', 0, 2],
  ['Spain', 'Saudi Arabia', 4, 0], ['Uruguay', 'Cape Verde', 2, 0],
  ['France', 'Iraq', 3, 0], ['Norway', 'Senegal', 1, 1],
  ['Argentina', 'Austria', 2, 1], ['Jordan', 'Algeria', 0, 2],
  ['Portugal', 'Uzbekistan', 3, 0], ['Colombia', 'DR Congo', 2, 1],
  ['England', 'Ghana', 2, 0], ['Panama', 'Croatia', 0, 2],
];
const RESULTS = new Map(MD12_RESULTS.map(([h, a, gh, ga]) => [`${norm(h)}|${norm(a)}`, { home: gh, away: ga }]));
const clamp = (n) => Math.max(0, Math.min(7, n));
function jitter(skill) {
  const spread = rand() < skill ? 1 : 2;
  return Math.round((rand() + rand() - 1) * spread); // triangular, biased to 0
}
// A skilled contestant predicts closer to the real result (more exact / near misses).
function predictFromResult(res, skill) {
  if (rand() < 0.08 + 0.4 * skill) return { home: res.home, away: res.away };
  return { home: clamp(res.home + jitter(skill)), away: clamp(res.away + jitter(skill)) };
}
const PRED_GOALS = [0, 0, 1, 1, 1, 2, 2, 3];
const plausible = () => ({ home: pick(PRED_GOALS), away: pick(PRED_GOALS) });

// ---- build matches ----
const matches = [];
for (const [group, md, date, time, city, homeEN, awayEN] of GROUP_FIXTURES) {
  const finished = md <= 2; // MD1 & MD2 played
  const m = {
    id: `g${group}-md${md}-${matches.filter((x) => x.round === 'group' && `${x.matchday}` === `${md}` && x.id.startsWith(`g${group}-md${md}`)).length + 1}`,
    round: 'group',
    matchday: md,
    kickoff: kickoff(date, time, city),
    venue: venueOf(city),
    homeTeamId: byEnglish.get(homeEN),
    awayTeamId: byEnglish.get(awayEN),
    status: finished ? 'finished' : 'scheduled',
  };
  if (finished) m.result = RESULTS.get(`${norm(homeEN)}|${norm(awayEN)}`);
  matches.push(m);
}
const koCounts = {};
for (const [round, date, city, homePh, awayPh] of KO) {
  koCounts[round] = (koCounts[round] || 0) + 1;
  matches.push({
    id: `${round}-${koCounts[round]}`,
    round,
    kickoff: kickoff(date, KO_TIME[(koCounts[round] - 1) % 2], city),
    venue: venueOf(city),
    homeTeamId: null,
    awayTeamId: null,
    homePlaceholder: homePh,
    awayPlaceholder: awayPh,
    status: 'scheduled',
  });
}

// ---- contestants (40 dummy) with a hidden skill level ----
const NAMES = [
  'Hakke', 'Ruub', 'Bram', 'An', 'Stijn', 'Lotte', 'Wout', 'Jens', 'Sven', 'Maarten',
  'Ellen', 'Tom', 'Niels', 'Koen', 'Bart', 'Lien', 'Dries', 'Pieter', 'Jonas', 'Kobe',
  'Senne', 'Lars', 'Thomas', 'Robbe', 'Seppe', 'Milan', 'Vince', 'Arne', 'Ward', 'Jasper',
  'Gilles', 'Mathias', 'Karel', 'Lukas', 'Femke', 'Sara', 'Joris', 'Glenn', 'Yves', 'Dirk',
];
// Real players from teams in the field (for top-scorer picks + scorers list).
const PLAYERS = [
  ['Kylian Mbappé', 'fr'], ['Harry Kane', 'gb-eng'], ['Vinícius Júnior', 'br'], ['Erling Haaland', 'no'],
  ['Lautaro Martínez', 'ar'], ['Kevin De Bruyne', 'be'], ['Lamine Yamal', 'es'], ['Jude Bellingham', 'gb-eng'],
  ['Cristiano Ronaldo', 'pt'], ['Heung-min Son', 'kr'], ['Achraf Hakimi', 'ma'], ['Cody Gakpo', 'nl'],
  ['Mohamed Salah', 'eg'], ['Luka Modrić', 'hr'], ['Federico Valverde', 'uy'], ['Takefusa Kubo', 'jp'],
];
// Title favourites weighted heavier for winner picks.
const FAVOURITES = ['br', 'fr', 'ar', 'es', 'gbeng', 'de', 'pt', 'nl', 'br', 'fr', 'ar', 'es'];
const allTeamIds = teams.map((t) => t.id);
const winnerPool = [...FAVOURITES, ...allTeamIds];

const seen = new Set();
const slug = (name) => {
  const base = name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  let s = base, n = 2;
  while (seen.has(s)) s = `${base}${n++}`;
  seen.add(s);
  return s;
};

const participants = NAMES.map((name) => ({
  id: slug(name),
  name,
  skill: Math.round((0.3 + rand() * 0.6) * 100) / 100, // 0.30 – 0.90
  bonus: {
    topScorer: pick(PLAYERS)[0],
    winnerTeamId: pick(winnerPool),
    mostConcededTeamId: pick(allTeamIds),
    mostScoredTeamId: pick(winnerPool),
  },
}));

// ---- predictions: every contestant predicts every group match ----
const resultByMatch = new Map(matches.filter((m) => m.result).map((m) => [m.id, m.result]));
const predictions = [];
for (const p of participants) {
  for (const m of matches) {
    if (m.round !== 'group') continue;
    const res = resultByMatch.get(m.id);
    const pred = res ? predictFromResult(res, p.skill) : plausible();
    predictions.push({ participantId: p.id, matchId: m.id, home: pred.home, away: pred.away });
  }
}
// ---- personal entry: real predictions provided by the user ----
const teamEnById = new Map(teams.map((t) => [t.id, t.en]));
const USER_LINES = [
  ['Mexico', 'South Africa', 1, 0], ['South Korea', 'Czech Republic', 1, 1], ['Canada', 'Bosnia and Herzegovina', 2, 0],
  ['United States', 'Paraguay', 2, 0], ['Qatar', 'Switzerland', 0, 2], ['Brazil', 'Morocco', 2, 0],
  ['Haiti', 'Scotland', 0, 2], ['Australia', 'Turkey', 0, 2], ['Germany', 'Curaçao', 4, 1],
  ['Ivory Coast', 'Ecuador', 0, 0], ['Netherlands', 'Japan', 2, 2], ['Sweden', 'Tunisia', 2, 0],
  ['Belgium', 'Egypt', 2, 0], ['Iran', 'New Zealand', 2, 0], ['Saudi Arabia', 'Uruguay', 0, 2],
  ['Spain', 'Cape Verde', 3, 0], ['France', 'Senegal', 2, 0], ['Iraq', 'Norway', 0, 3],
  ['Argentina', 'Algeria', 2, 0], ['Austria', 'Jordan', 3, 0], ['Portugal', 'DR Congo', 2, 0],
  ['Uzbekistan', 'Colombia', 0, 2], ['England', 'Croatia', 2, 0], ['Ghana', 'Panama', 2, 0],
  ['Czech Republic', 'South Africa', 2, 0], ['Mexico', 'South Korea', 2, 0], ['Canada', 'Qatar', 3, 0],
  ['Switzerland', 'Bosnia and Herzegovina', 3, 0], ['Brazil', 'Haiti', 4, 1], ['Scotland', 'Morocco', 0, 2],
  ['Turkey', 'Paraguay', 2, 0], ['United States', 'Australia', 2, 1], ['Ecuador', 'Curaçao', 3, 0],
  ['Germany', 'Ivory Coast', 3, 0], ['Netherlands', 'Sweden', 3, 1], ['Tunisia', 'Japan', 0, 2],
  ['Belgium', 'Iran', 3, 0], ['New Zealand', 'Egypt', 0, 2], ['Spain', 'Saudi Arabia', 3, 1],
  ['Uruguay', 'Cape Verde', 3, 0], ['France', 'Iraq', 3, 0], ['Norway', 'Senegal', 2, 1],
  ['Argentina', 'Austria', 2, 0], ['Jordan', 'Algeria', 0, 3], ['Colombia', 'DR Congo', 2, 0],
  ['Portugal', 'Uzbekistan', 3, 0], ['England', 'Ghana', 3, 0], ['Panama', 'Croatia', 0, 3],
  ['Mexico', 'Czech Republic', 2, 0], ['South Africa', 'South Korea', 0, 2], ['Bosnia and Herzegovina', 'Qatar', 3, 0],
  ['Canada', 'Switzerland', 1, 2], ['Morocco', 'Haiti', 3, 0], ['Scotland', 'Brazil', 0, 3],
  ['Paraguay', 'Australia', 2, 0], ['United States', 'Turkey', 1, 3], ['Curaçao', 'Ivory Coast', 0, 3],
  ['Ecuador', 'Germany', 0, 2], ['Japan', 'Sweden', 2, 0], ['Tunisia', 'Netherlands', 0, 3],
  ['Egypt', 'Iran', 2, 0], ['New Zealand', 'Belgium', 0, 3], ['Cape Verde', 'Saudi Arabia', 0, 2],
  ['Uruguay', 'Spain', 0, 2], ['Norway', 'France', 1, 2], ['Senegal', 'Iraq', 2, 0],
  ['Algeria', 'Austria', 0, 2], ['Jordan', 'Argentina', 1, 3], ['Colombia', 'Portugal', 1, 2],
  ['DR Congo', 'Uzbekistan', 2, 0], ['Croatia', 'Ghana', 2, 0], ['Panama', 'England', 0, 3],
];
const USER_PRED = new Map(USER_LINES.map(([h, a, gh, ga]) => [`${norm(h)}|${norm(a)}`, [gh, ga]]));
const barry = {
  id: 'barry',
  name: 'Barry',
  bonus: { topScorer: 'Kylian Mbappé', winnerTeamId: 'es', mostConcededTeamId: 'cw', mostScoredTeamId: 'es' },
};
for (const m of matches) {
  if (m.round !== 'group') continue;
  const homeEN = norm(teamEnById.get(m.homeTeamId));
  const awayEN = norm(teamEnById.get(m.awayTeamId));
  const direct = USER_PRED.get(`${homeEN}|${awayEN}`);
  const reversed = USER_PRED.get(`${awayEN}|${homeEN}`);
  let home, away;
  if (direct) { [home, away] = direct; }
  else if (reversed) { home = reversed[1]; away = reversed[0]; } // user listed the teams the other way round
  if (home !== undefined) predictions.push({ participantId: barry.id, matchId: m.id, home, away });
  else console.warn('No user prediction for', teamEnById.get(m.homeTeamId), 'vs', teamEnById.get(m.awayTeamId));
}

// skill is a generation-only field; keep it out of the persisted data
const participantsOut = [barry, ...participants.map(({ skill, ...p }) => p)];

// ---- scorers ----
const goalsSeq = [7, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1];
const scorers = PLAYERS.map(([player, iso], i) => ({ player, teamId: idOf(iso), goals: goalsSeq[i] ?? 1 }));

// ---- outcomes (tournament ongoing -> unknown) ----
const outcomes = { topScorer: '', winnerTeamId: '', mostConcededTeamId: '', mostScoredTeamId: '' };

const settings = {
  multipliers: { group: 1, r32: 2, r16: 3, qf: 4, sf: 4, third: 4, final: 5 },
  bonusPoints: 30,
};

const write = (name, data) => writeFileSync(join(DATA, name), JSON.stringify(data, null, 2) + '\n');
write('teams.json', teamsOut);
write('groups.json', groups);
write('matches.json', matches);
write('participants.json', participantsOut);
write('predictions.json', predictions);
write('scorers.json', scorers);
write('outcomes.json', outcomes);
write('settings.json', settings);

console.log(`Generated: ${teamsOut.length} teams, ${groups.length} groups, ${matches.length} matches (${matches.filter((m) => m.status === 'finished').length} played), ${participantsOut.length} contestants, ${predictions.length} predictions.`);
