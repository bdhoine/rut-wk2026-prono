// Deterministic data generator for the Rut Prono WK 2026 app.
// Uses the REAL 2026 FIFA World Cup draw + fixture schedule. Kickoffs carry each
// venue's UTC offset, so the frontend (Europe/Brussels) shows Belgium time.
//
// PHASES (pass as the first CLI arg, default "groups"):
//   start   – tournament not started: full schedule, no results, only Barry's real predictions
//   md2     – after matchday 2 (MD1+MD2 played; MD3 + knockout to come)
//   groups  – group stage complete (MD1-3 played; Round of 32 teams known, not played)
//   final   – whole tournament played (champion decided, bonus outcomes resolved)
//
// Quick switch:  npm run data:md2 | npm run data:groups | npm run data:final
//
// Matchday 1 & 2 use hand-crafted realistic results; matchday 3 and the knockout
// bracket are simulated from team strengths (deterministic). Contestants are 40
// fictional entries + one real personal entry ("Barry"); dummy predictions are
// skill-based so the ranking spreads naturally.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
mkdirSync(DATA, { recursive: true });

const PHASE = (process.argv[2] || 'groups').toLowerCase();
if (!['start', 'md2', 'groups', 'final'].includes(PHASE)) {
  console.error(`Unknown phase "${PHASE}". Use: start | md2 | groups | final`);
  process.exit(1);
}
const NO_RESULTS = PHASE === 'start'; // tournament not started: schedule only, no results
const NO_DUMMIES = PHASE === 'start'; // only the real entries, no dummy contestants
const GROUP3_DONE = PHASE === 'groups' || PHASE === 'final';
const KO_RESOLVED = PHASE === 'groups' || PHASE === 'final'; // knockout teams known
const KO_PLAYED = PHASE === 'final';

// ---- two independent seeded RNGs (results vs predictions) so group-stage data
//      stays identical across phases; only knockout content differs. ----
function rng(s) {
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const resR = rng(20260611);
const predR = rng(70077007);
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

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
const teamEnById = new Map(teams.map((t) => [t.id, t.en]));
const teamsOut = teams.map(({ en, ...t }) => t);

const GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const groups = GROUP_IDS.map((g) => ({ id: g, teamIds: teams.filter((t) => t.group === g).map((t) => t.id) }));

// rough team strength (drives simulated results + knockout winners + tie-breaks)
const STR = {
  mx: 74, za: 60, kr: 73, cz: 70, ca: 70, ba: 66, qa: 64, ch: 78, br: 91, ma: 80, ht: 50, gbsct: 67,
  us: 74, py: 66, au: 67, tr: 75, de: 86, cw: 48, ci: 73, ec: 72, nl: 85, jp: 76, se: 70, tn: 67,
  be: 83, eg: 73, ir: 70, nz: 55, es: 90, cv: 57, sa: 63, uy: 81, fr: 92, sn: 78, iq: 60, no: 77,
  ar: 91, dz: 71, at: 73, jo: 57, pt: 86, cd: 66, uz: 62, co: 79, gbeng: 88, hr: 80, gh: 68, pa: 59,
};

// ---- venues ----
const CITY = {
  'Mexico City': ['-06:00', 'Estadio Azteca, Mexico-Stad'], 'Zapopan': ['-06:00', 'Estadio Akron, Guadalajara'],
  'Guadalupe': ['-06:00', 'Estadio BBVA, Monterrey'], 'Atlanta': ['-04:00', 'Mercedes-Benz Stadium, Atlanta'],
  'East Rutherford': ['-04:00', 'MetLife Stadium, New York'], 'Foxborough': ['-04:00', 'Gillette Stadium, Boston'],
  'Philadelphia': ['-04:00', 'Lincoln Financial Field, Philadelphia'], 'Miami Gardens': ['-04:00', 'Hard Rock Stadium, Miami'],
  'Toronto': ['-04:00', 'BMO Field, Toronto'], 'Houston': ['-05:00', 'NRG Stadium, Houston'],
  'Kansas City': ['-05:00', 'Arrowhead Stadium, Kansas City'], 'Arlington': ['-05:00', 'AT&T Stadium, Dallas'],
  'Inglewood': ['-07:00', 'SoFi Stadium, Los Angeles'], 'Santa Clara': ['-07:00', "Levi's Stadium, San Francisco"],
  'Seattle': ['-07:00', 'Lumen Field, Seattle'], 'Vancouver': ['-07:00', 'BC Place, Vancouver'],
};
const kickoff = (date, time, city) => `${date}T${time}:00${CITY[city][0]}`;
const venueOf = (city) => CITY[city][1];

// ---- group fixtures: [group, matchday, date, localTime, city, homeEN, awayEN] ----
const GROUP_FIXTURES = [
  ['A', 1, '2026-06-11', '13:00', 'Mexico City', 'Mexico', 'South Africa'], ['A', 1, '2026-06-11', '20:00', 'Zapopan', 'South Korea', 'Czech Republic'],
  ['A', 2, '2026-06-18', '12:00', 'Atlanta', 'Czech Republic', 'South Africa'], ['A', 2, '2026-06-18', '19:00', 'Zapopan', 'Mexico', 'South Korea'],
  ['A', 3, '2026-06-24', '19:00', 'Mexico City', 'Czech Republic', 'Mexico'], ['A', 3, '2026-06-24', '19:00', 'Guadalupe', 'South Africa', 'South Korea'],
  ['B', 1, '2026-06-12', '15:00', 'Toronto', 'Canada', 'Bosnia and Herzegovina'], ['B', 1, '2026-06-13', '12:00', 'Santa Clara', 'Qatar', 'Switzerland'],
  ['B', 2, '2026-06-18', '12:00', 'Inglewood', 'Switzerland', 'Bosnia and Herzegovina'], ['B', 2, '2026-06-18', '15:00', 'Vancouver', 'Canada', 'Qatar'],
  ['B', 3, '2026-06-24', '12:00', 'Vancouver', 'Switzerland', 'Canada'], ['B', 3, '2026-06-24', '12:00', 'Seattle', 'Bosnia and Herzegovina', 'Qatar'],
  ['C', 1, '2026-06-13', '18:00', 'East Rutherford', 'Brazil', 'Morocco'], ['C', 1, '2026-06-13', '21:00', 'Foxborough', 'Haiti', 'Scotland'],
  ['C', 2, '2026-06-19', '18:00', 'Foxborough', 'Scotland', 'Morocco'], ['C', 2, '2026-06-19', '20:30', 'Philadelphia', 'Brazil', 'Haiti'],
  ['C', 3, '2026-06-24', '18:00', 'Miami Gardens', 'Scotland', 'Brazil'], ['C', 3, '2026-06-24', '18:00', 'Atlanta', 'Morocco', 'Haiti'],
  ['D', 1, '2026-06-12', '18:00', 'Inglewood', 'United States', 'Paraguay'], ['D', 1, '2026-06-13', '21:00', 'Vancouver', 'Australia', 'Turkey'],
  ['D', 2, '2026-06-19', '12:00', 'Seattle', 'United States', 'Australia'], ['D', 2, '2026-06-19', '20:00', 'Santa Clara', 'Turkey', 'Paraguay'],
  ['D', 3, '2026-06-25', '19:00', 'Inglewood', 'Turkey', 'United States'], ['D', 3, '2026-06-25', '19:00', 'Santa Clara', 'Paraguay', 'Australia'],
  ['E', 1, '2026-06-14', '12:00', 'Houston', 'Germany', 'Curacao'], ['E', 1, '2026-06-14', '19:00', 'Philadelphia', 'Ivory Coast', 'Ecuador'],
  ['E', 2, '2026-06-20', '16:00', 'Toronto', 'Germany', 'Ivory Coast'], ['E', 2, '2026-06-20', '19:00', 'Kansas City', 'Ecuador', 'Curacao'],
  ['E', 3, '2026-06-25', '16:00', 'Philadelphia', 'Curacao', 'Ivory Coast'], ['E', 3, '2026-06-25', '16:00', 'East Rutherford', 'Ecuador', 'Germany'],
  ['F', 1, '2026-06-14', '15:00', 'Arlington', 'Netherlands', 'Japan'], ['F', 1, '2026-06-14', '20:00', 'Guadalupe', 'Sweden', 'Tunisia'],
  ['F', 2, '2026-06-20', '12:00', 'Houston', 'Netherlands', 'Sweden'], ['F', 2, '2026-06-20', '22:00', 'Guadalupe', 'Tunisia', 'Japan'],
  ['F', 3, '2026-06-25', '18:00', 'Arlington', 'Japan', 'Sweden'], ['F', 3, '2026-06-25', '18:00', 'Kansas City', 'Tunisia', 'Netherlands'],
  ['G', 1, '2026-06-15', '12:00', 'Seattle', 'Belgium', 'Egypt'], ['G', 1, '2026-06-15', '18:00', 'Inglewood', 'Iran', 'New Zealand'],
  ['G', 2, '2026-06-21', '12:00', 'Inglewood', 'Belgium', 'Iran'], ['G', 2, '2026-06-21', '18:00', 'Vancouver', 'New Zealand', 'Egypt'],
  ['G', 3, '2026-06-26', '20:00', 'Seattle', 'Egypt', 'Iran'], ['G', 3, '2026-06-26', '20:00', 'Vancouver', 'New Zealand', 'Belgium'],
  ['H', 1, '2026-06-15', '12:00', 'Atlanta', 'Spain', 'Cape Verde'], ['H', 1, '2026-06-15', '18:00', 'Miami Gardens', 'Saudi Arabia', 'Uruguay'],
  ['H', 2, '2026-06-21', '12:00', 'Atlanta', 'Spain', 'Saudi Arabia'], ['H', 2, '2026-06-21', '18:00', 'Miami Gardens', 'Uruguay', 'Cape Verde'],
  ['H', 3, '2026-06-26', '19:00', 'Houston', 'Cape Verde', 'Saudi Arabia'], ['H', 3, '2026-06-26', '18:00', 'Zapopan', 'Uruguay', 'Spain'],
  ['I', 1, '2026-06-16', '15:00', 'East Rutherford', 'France', 'Senegal'], ['I', 1, '2026-06-16', '18:00', 'Foxborough', 'Iraq', 'Norway'],
  ['I', 2, '2026-06-22', '17:00', 'Philadelphia', 'France', 'Iraq'], ['I', 2, '2026-06-22', '20:00', 'East Rutherford', 'Norway', 'Senegal'],
  ['I', 3, '2026-06-26', '15:00', 'Foxborough', 'Norway', 'France'], ['I', 3, '2026-06-26', '15:00', 'Toronto', 'Senegal', 'Iraq'],
  ['J', 1, '2026-06-16', '20:00', 'Kansas City', 'Argentina', 'Algeria'], ['J', 1, '2026-06-16', '21:00', 'Santa Clara', 'Austria', 'Jordan'],
  ['J', 2, '2026-06-22', '12:00', 'Arlington', 'Argentina', 'Austria'], ['J', 2, '2026-06-22', '20:00', 'Santa Clara', 'Jordan', 'Algeria'],
  ['J', 3, '2026-06-27', '21:00', 'Kansas City', 'Algeria', 'Austria'], ['J', 3, '2026-06-27', '21:00', 'Arlington', 'Jordan', 'Argentina'],
  ['K', 1, '2026-06-17', '12:00', 'Houston', 'Portugal', 'DR Congo'], ['K', 1, '2026-06-17', '20:00', 'Mexico City', 'Uzbekistan', 'Colombia'],
  ['K', 2, '2026-06-23', '12:00', 'Houston', 'Portugal', 'Uzbekistan'], ['K', 2, '2026-06-23', '20:00', 'Zapopan', 'Colombia', 'DR Congo'],
  ['K', 3, '2026-06-27', '19:30', 'Miami Gardens', 'Colombia', 'Portugal'], ['K', 3, '2026-06-27', '19:30', 'Atlanta', 'DR Congo', 'Uzbekistan'],
  ['L', 1, '2026-06-17', '15:00', 'Arlington', 'England', 'Croatia'], ['L', 1, '2026-06-17', '19:00', 'Toronto', 'Ghana', 'Panama'],
  ['L', 2, '2026-06-23', '16:00', 'Foxborough', 'England', 'Ghana'], ['L', 2, '2026-06-23', '19:00', 'Toronto', 'Panama', 'Croatia'],
  ['L', 3, '2026-06-27', '17:00', 'East Rutherford', 'Panama', 'England'], ['L', 3, '2026-06-27', '17:00', 'Philadelphia', 'Croatia', 'Ghana'],
];

// ---- knockout slots: [round, date, city, homePlaceholder, awayPlaceholder] ----
const KO = [
  ['r32', '2026-06-28', 'Inglewood', '2e Groep A', '2e Groep B'], ['r32', '2026-06-29', 'Foxborough', 'Winnaar Groep E', 'Beste 3e (A/B/C/D/F)'],
  ['r32', '2026-06-29', 'Guadalupe', 'Winnaar Groep F', '2e Groep C'], ['r32', '2026-06-29', 'Houston', 'Winnaar Groep C', '2e Groep F'],
  ['r32', '2026-06-30', 'East Rutherford', 'Winnaar Groep I', 'Beste 3e (C/D/F/G/H)'], ['r32', '2026-06-30', 'Arlington', '2e Groep E', '2e Groep I'],
  ['r32', '2026-06-30', 'Mexico City', 'Winnaar Groep A', 'Beste 3e (C/E/F/H/I)'], ['r32', '2026-07-01', 'Atlanta', 'Winnaar Groep L', 'Beste 3e (E/H/I/J/K)'],
  ['r32', '2026-07-01', 'Santa Clara', 'Winnaar Groep D', 'Beste 3e (B/E/F/I/J)'], ['r32', '2026-07-01', 'Seattle', 'Winnaar Groep G', 'Beste 3e (A/E/H/I/J)'],
  ['r32', '2026-07-02', 'Toronto', '2e Groep K', '2e Groep L'], ['r32', '2026-07-02', 'Inglewood', 'Winnaar Groep H', '2e Groep J'],
  ['r32', '2026-07-02', 'Vancouver', 'Winnaar Groep B', 'Beste 3e (E/F/G/I/J)'], ['r32', '2026-07-03', 'Miami Gardens', 'Winnaar Groep J', '2e Groep H'],
  ['r32', '2026-07-03', 'Kansas City', 'Winnaar Groep K', 'Beste 3e (D/E/I/J/L)'], ['r32', '2026-07-03', 'Arlington', '2e Groep D', '2e Groep G'],
  ['r16', '2026-07-04', 'Philadelphia', 'Winnaar R32-2', 'Winnaar R32-5'], ['r16', '2026-07-04', 'Houston', 'Winnaar R32-1', 'Winnaar R32-3'],
  ['r16', '2026-07-05', 'East Rutherford', 'Winnaar R32-4', 'Winnaar R32-6'], ['r16', '2026-07-05', 'Mexico City', 'Winnaar R32-7', 'Winnaar R32-8'],
  ['r16', '2026-07-06', 'Arlington', 'Winnaar R32-11', 'Winnaar R32-12'], ['r16', '2026-07-06', 'Seattle', 'Winnaar R32-9', 'Winnaar R32-10'],
  ['r16', '2026-07-07', 'Atlanta', 'Winnaar R32-14', 'Winnaar R32-16'], ['r16', '2026-07-07', 'Vancouver', 'Winnaar R32-13', 'Winnaar R32-15'],
  ['qf', '2026-07-09', 'Foxborough', 'Winnaar 1/8 1', 'Winnaar 1/8 2'], ['qf', '2026-07-10', 'Inglewood', 'Winnaar 1/8 5', 'Winnaar 1/8 6'],
  ['qf', '2026-07-11', 'Miami Gardens', 'Winnaar 1/8 3', 'Winnaar 1/8 4'], ['qf', '2026-07-11', 'Kansas City', 'Winnaar 1/8 7', 'Winnaar 1/8 8'],
  ['sf', '2026-07-14', 'Arlington', 'Winnaar KF 1', 'Winnaar KF 2'], ['sf', '2026-07-15', 'Atlanta', 'Winnaar KF 3', 'Winnaar KF 4'],
  ['third', '2026-07-18', 'Miami Gardens', 'Verliezer HF 1', 'Verliezer HF 2'], ['final', '2026-07-19', 'East Rutherford', 'Winnaar HF 1', 'Winnaar HF 2'],
];
const KO_TIME = ['18:00', '21:00'];

// ---- result simulation ----
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= resR(); } while (p > L);
  return Math.min(6, k - 1);
}
function simResult(hId, aId) {
  const diff = ((STR[hId] ?? 65) - (STR[aId] ?? 65)) / 100;
  return { home: poisson(Math.max(0.25, 1.35 + diff * 1.7 + 0.2)), away: poisson(Math.max(0.2, 1.2 - diff * 1.7)) };
}
function simKO(hId, aId) {
  const r = simResult(hId, aId);
  let winner, loser;
  if (r.home > r.away) { winner = hId; loser = aId; }
  else if (r.away > r.home) { winner = aId; loser = hId; }
  else { // level after 120' -> penalties; stronger (then home) advances
    if ((STR[hId] ?? 0) >= (STR[aId] ?? 0)) { winner = hId; loser = aId; } else { winner = aId; loser = hId; }
  }
  return { result: r, winner, loser };
}

// hand-crafted realistic results for MD1 & MD2
const MD12 = [
  ['Mexico', 'South Africa', 2, 1], ['South Korea', 'Czech Republic', 1, 1], ['Canada', 'Bosnia and Herzegovina', 1, 0], ['Qatar', 'Switzerland', 0, 3],
  ['Brazil', 'Morocco', 2, 0], ['Haiti', 'Scotland', 0, 2], ['United States', 'Paraguay', 2, 1], ['Australia', 'Turkey', 1, 1],
  ['Germany', 'Curacao', 3, 0], ['Ivory Coast', 'Ecuador', 1, 1], ['Netherlands', 'Japan', 2, 1], ['Sweden', 'Tunisia', 1, 0],
  ['Belgium', 'Egypt', 2, 0], ['Iran', 'New Zealand', 1, 0], ['Spain', 'Cape Verde', 3, 0], ['Saudi Arabia', 'Uruguay', 0, 2],
  ['France', 'Senegal', 2, 0], ['Iraq', 'Norway', 0, 2], ['Argentina', 'Algeria', 3, 0], ['Austria', 'Jordan', 2, 0],
  ['Portugal', 'DR Congo', 2, 0], ['Uzbekistan', 'Colombia', 0, 1], ['England', 'Croatia', 2, 0], ['Ghana', 'Panama', 1, 1],
  ['Czech Republic', 'South Africa', 1, 0], ['Mexico', 'South Korea', 1, 1], ['Switzerland', 'Bosnia and Herzegovina', 2, 1], ['Canada', 'Qatar', 2, 0],
  ['Scotland', 'Morocco', 0, 1], ['Brazil', 'Haiti', 4, 1], ['United States', 'Australia', 1, 1], ['Turkey', 'Paraguay', 2, 0],
  ['Germany', 'Ivory Coast', 2, 0], ['Ecuador', 'Curacao', 2, 0], ['Netherlands', 'Sweden', 3, 1], ['Tunisia', 'Japan', 0, 1],
  ['Belgium', 'Iran', 3, 1], ['New Zealand', 'Egypt', 0, 2], ['Spain', 'Saudi Arabia', 4, 0], ['Uruguay', 'Cape Verde', 2, 0],
  ['France', 'Iraq', 3, 0], ['Norway', 'Senegal', 1, 1], ['Argentina', 'Austria', 2, 1], ['Jordan', 'Algeria', 0, 2],
  ['Portugal', 'Uzbekistan', 3, 0], ['Colombia', 'DR Congo', 2, 1], ['England', 'Ghana', 2, 0], ['Panama', 'Croatia', 0, 2],
];
const MD12_RESULTS = new Map(MD12.map(([h, a, gh, ga]) => [`${norm(h)}|${norm(a)}`, { home: gh, away: ga }]));

// ---- build group matches ----
const matches = [];
const perGroupMd = {};
for (const [group, md, date, time, city, homeEN, awayEN] of GROUP_FIXTURES) {
  const key = `${group}-${md}`;
  perGroupMd[key] = (perGroupMd[key] || 0) + 1;
  const homeId = byEnglish.get(homeEN), awayId = byEnglish.get(awayEN);
  const finished = !NO_RESULTS && (md <= 2 || (md === 3 && GROUP3_DONE));
  const m = {
    id: `g${group}-md${md}-${perGroupMd[key]}`, round: 'group', matchday: md,
    kickoff: kickoff(date, time, city), venue: venueOf(city),
    homeTeamId: homeId, awayTeamId: awayId, status: finished ? 'finished' : 'scheduled',
  };
  if (finished) {
    m.result = md <= 2 ? MD12_RESULTS.get(`${norm(homeEN)}|${norm(awayEN)}`) : simResult(homeId, awayId);
  }
  matches.push(m);
}

// ---- standings (group complete) ----
function groupStandings(groupId) {
  const ids = groups.find((g) => g.id === groupId).teamIds;
  const row = {};
  ids.forEach((id) => (row[id] = { id, pts: 0, gf: 0, ga: 0 }));
  for (const m of matches) {
    if (m.round !== 'group' || !m.result || !row[m.homeTeamId] || !row[m.awayTeamId]) continue;
    const h = row[m.homeTeamId], a = row[m.awayTeamId], r = m.result;
    h.gf += r.home; h.ga += r.away; a.gf += r.away; a.ga += r.home;
    if (r.home > r.away) h.pts += 3; else if (r.home < r.away) a.pts += 3; else { h.pts++; a.pts++; }
  }
  return ids.map((id) => ({ ...row[id], gd: row[id].gf - row[id].ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (STR[y.id] ?? 0) - (STR[x.id] ?? 0));
}

// ---- knockout resolution + simulation ----
const winners = {}, losers = {};
if (KO_RESOLVED) {
  const stand = Object.fromEntries(GROUP_IDS.map((g) => [g, groupStandings(g)]));
  const bestThirds = GROUP_IDS.map((g) => ({ g, ...stand[g][2] }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (STR[y.id] ?? 0) - (STR[x.id] ?? 0))
    .slice(0, 8);
  let thirdIdx = 0;
  const num = (s) => parseInt(s.match(/(\d+)\s*$/)[1], 10); // trailing number (e.g. "R32-2" -> 2)
  const resolve = (ph) => {
    if (ph.startsWith('Winnaar Groep ')) return stand[ph.slice(-1)][0].id;
    if (ph.startsWith('2e Groep ')) return stand[ph.slice(-1)][1].id;
    if (ph.startsWith('Beste 3e')) return bestThirds[thirdIdx++]?.id ?? null;
    if (ph.startsWith('Winnaar R32-')) return winners[`r32-${num(ph)}`] ?? null;
    if (ph.startsWith('Winnaar 1/8 ')) return winners[`r16-${num(ph)}`] ?? null;
    if (ph.startsWith('Winnaar KF ')) return winners[`qf-${num(ph)}`] ?? null;
    if (ph.startsWith('Winnaar HF ')) return winners[`sf-${num(ph)}`] ?? null;
    if (ph.startsWith('Verliezer HF ')) return losers[`sf-${num(ph)}`] ?? null;
    return null;
  };

  const koCount = {};
  for (const [round, date, city, homePh, awayPh] of KO) {
    koCount[round] = (koCount[round] || 0) + 1;
    const id = `${round}-${koCount[round]}`;
    // R32 teams come from the group stage (always resolvable here). Later rounds
    // only resolve once earlier rounds have been played (final phase).
    const homeId = (round === 'r32' || KO_PLAYED) ? resolve(homePh) : null;
    const awayId = (round === 'r32' || KO_PLAYED) ? resolve(awayPh) : null;
    const m = {
      id, round, kickoff: kickoff(date, KO_TIME[(koCount[round] - 1) % 2], city), venue: venueOf(city),
      homeTeamId: homeId, awayTeamId: awayId, status: 'scheduled',
    };
    if (!homeId) m.homePlaceholder = homePh;
    if (!awayId) m.awayPlaceholder = awayPh;
    if (KO_PLAYED && homeId && awayId) {
      const ko = simKO(homeId, awayId);
      m.result = ko.result; m.status = 'finished';
      winners[id] = ko.winner; losers[id] = ko.loser;
    }
    matches.push(m);
  }
} else {
  // md2 phase: knockout is all placeholders
  const koCount = {};
  for (const [round, date, city, homePh, awayPh] of KO) {
    koCount[round] = (koCount[round] || 0) + 1;
    matches.push({
      id: `${round}-${koCount[round]}`, round, kickoff: kickoff(date, KO_TIME[(koCount[round] - 1) % 2], city),
      venue: venueOf(city), homeTeamId: null, awayTeamId: null, homePlaceholder: homePh, awayPlaceholder: awayPh, status: 'scheduled',
    });
  }
}

// ---- prediction helpers ----
const clamp = (n) => Math.max(0, Math.min(7, n));
function jitter(skill) {
  const spread = predR() < skill ? 1 : 2;
  return Math.round((predR() + predR() - 1) * spread);
}
function predictFromResult(res, skill) {
  if (predR() < 0.08 + 0.4 * skill) return { home: res.home, away: res.away };
  return { home: clamp(res.home + jitter(skill)), away: clamp(res.away + jitter(skill)) };
}
const PRED_GOALS = [0, 0, 1, 1, 1, 2, 2, 3];
const plausible = () => ({ home: pick(PRED_GOALS, predR), away: pick(PRED_GOALS, predR) });

// ---- contestants ----
const NAMES = [
  'Hakke', 'Ruub', 'Bram', 'An', 'Stijn', 'Lotte', 'Wout', 'Jens', 'Sven', 'Maarten',
  'Ellen', 'Tom', 'Niels', 'Koen', 'Bart', 'Lien', 'Dries', 'Pieter', 'Jonas', 'Kobe',
  'Senne', 'Lars', 'Thomas', 'Robbe', 'Seppe', 'Milan', 'Vince', 'Arne', 'Ward', 'Jasper',
  'Gilles', 'Mathias', 'Karel', 'Lukas', 'Femke', 'Sara', 'Joris', 'Glenn', 'Yves', 'Dirk',
];
const PLAYERS = [
  ['Kylian Mbappé', 'fr'], ['Harry Kane', 'gb-eng'], ['Vinícius Júnior', 'br'], ['Erling Haaland', 'no'],
  ['Lautaro Martínez', 'ar'], ['Kevin De Bruyne', 'be'], ['Lamine Yamal', 'es'], ['Jude Bellingham', 'gb-eng'],
  ['Cristiano Ronaldo', 'pt'], ['Heung-min Son', 'kr'], ['Achraf Hakimi', 'ma'], ['Cody Gakpo', 'nl'],
  ['Mohamed Salah', 'eg'], ['Luka Modrić', 'hr'], ['Federico Valverde', 'uy'], ['Takefusa Kubo', 'jp'],
];
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

// Barry: real personal entry (skill only used for his knockout predictions).
const barry = {
  id: 'barry', name: 'Barry', skill: 0.82,
  bonus: { topScorer: 'Kylian Mbappé', winnerTeamId: 'es', mostConcededTeamId: 'cw', mostScoredTeamId: 'es' },
};
const dummies = NAMES.map((name) => ({
  id: slug(name), name, skill: Math.round((0.3 + predR() * 0.6) * 100) / 100,
  bonus: {
    topScorer: pick(PLAYERS, predR)[0], winnerTeamId: pick(winnerPool, predR),
    mostConcededTeamId: pick(allTeamIds, predR), mostScoredTeamId: pick(winnerPool, predR),
  },
}));
const teamNlById = new Map(teams.map((t) => [t.id, t.name]));
const dutchMap = (lines) => new Map(lines.map(([h, a, gh, ga]) => [`${norm(h)}|${norm(a)}`, [gh, ga]]));
// De Fijne & Maxim Breugelmans — group predictions transcribed from their paper
// forms (WhatsApp photos). Cells that weren't clearly legible are omitted (skipped),
// so those matches simply have no prediction for that player.
const DEFIJNE_LINES = [
  // matchday 1 (re-read from clearer photos, cross-checked across two duplicate photos;
  // only cells where both photos clearly agree are kept)
  ['Mexico', 'Zuid-Afrika', 2, 1], ['Zuid-Korea', 'Tsjechië', 0, 2], ['Canada', 'Bosnië-Herzegovina', 1, 1], ['Verenigde Staten', 'Paraguay', 2, 1],
  ['Qatar', 'Zwitserland', 0, 2], ['Brazilië', 'Marokko', 1, 0], ['Haïti', 'Schotland', 0, 3], ['Australië', 'Turkije', 0, 3],
  ['Duitsland', 'Curaçao', 3, 0], ['Nederland', 'Japan', 3, 0], ['Zweden', 'Tunesië', 1, 0], ['Spanje', 'Kaapverdië', 4, 0],
  ['België', 'Egypte', 2, 1], ['Saoedi-Arabië', 'Uruguay', 1, 2], ['Iran', 'Nieuw-Zeeland', 1, 1], ['Frankrijk', 'Senegal', 1, 2],
  ['Irak', 'Noorwegen', 0, 0], ['Argentinië', 'Algerije', 3, 0], ['Oostenrijk', 'Jordanië', 2, 0], ['Portugal', 'DR Congo', 1, 2],
  ['Oezbekistan', 'Colombia', 0, 3],
  // matchday 2
  ['Tsjechië', 'Zuid-Afrika', 2, 1], ['Zwitserland', 'Bosnië-Herzegovina', 3, 0], ['Canada', 'Qatar', 2, 0], ['Mexico', 'Zuid-Korea', 2, 1],
  ['Verenigde Staten', 'Australië', 0, 1], ['Brazilië', 'Haïti', 5, 0], ['Turkije', 'Paraguay', 2, 0], ['Nederland', 'Zweden', 1, 2],
  ['Duitsland', 'Ivoorkust', 2, 1], ['Ecuador', 'Curaçao', 3, 1], ['Tunesië', 'Japan', 1, 2], ['Spanje', 'Saoedi-Arabië', 4, 0],
  ['België', 'Iran', 3, 0], ['Uruguay', 'Kaapverdië', 4, 0], ['Nieuw-Zeeland', 'Egypte', 1, 3], ['Argentinië', 'Oostenrijk', 4, 1],
  ['Frankrijk', 'Irak', 3, 0], ['Noorwegen', 'Senegal', 1, 3], ['Jordanië', 'Algerije', 0, 3],
  // matchday 3 (now legible from two duplicate photos; only cells where both photos clearly agree)
  ['Zwitserland', 'Canada', 2, 0], ['Bosnië-Herzegovina', 'Qatar', 3, 0], ['Marokko', 'Haïti', 3, 0], ['Schotland', 'Brazilië', 0, 1],
  ['Zuid-Afrika', 'Zuid-Korea', 2, 1], ['Curaçao', 'Ivoorkust', 0, 4], ['Ecuador', 'Duitsland', 0, 3], ['Japan', 'Zweden', 3, 3],
  ['Paraguay', 'Australië', 0, 1], ['Algerije', 'Oostenrijk', 3, 1], ['Jordanië', 'Argentinië', 0, 4],
];
const MAXIM_LINES = [
  // matchday 1
  ['Mexico', 'Zuid-Afrika', 2, 0], ['Zuid-Korea', 'Tsjechië', 1, 1], ['Canada', 'Bosnië-Herzegovina', 1, 1], ['Verenigde Staten', 'Paraguay', 2, 1],
  ['Qatar', 'Zwitserland', 0, 2], ['Brazilië', 'Marokko', 2, 0], ['Haïti', 'Schotland', 0, 2], ['Australië', 'Turkije', 1, 2],
  ['Duitsland', 'Curaçao', 4, 0], ['Nederland', 'Japan', 2, 1], ['Ivoorkust', 'Ecuador', 2, 0], ['Zweden', 'Tunesië', 4, 0],
  ['Spanje', 'Kaapverdië', 2, 0], ['Argentinië', 'Algerije', 3, 0], ['Oostenrijk', 'Jordanië', 2, 0], ['Portugal', 'DR Congo', 3, 0],
  ['Engeland', 'Kroatië', 2, 1], ['Oezbekistan', 'Colombia', 1, 2],
  ['België', 'Egypte', 2, 0], ['Saoedi-Arabië', 'Uruguay', 0, 2], ['Iran', 'Nieuw-Zeeland', 2, 1], ['Frankrijk', 'Senegal', 2, 0],
  ['Irak', 'Noorwegen', 0, 3], ['Ghana', 'Panama', 2, 1],
  // matchday 2
  ['Tsjechië', 'Zuid-Afrika', 2, 0], ['Zwitserland', 'Bosnië-Herzegovina', 2, 1], ['Canada', 'Qatar', 2, 0], ['Mexico', 'Zuid-Korea', 2, 1],
  ['Verenigde Staten', 'Australië', 2, 0], ['Schotland', 'Marokko', 1, 1], ['Brazilië', 'Haïti', 4, 0], ['Turkije', 'Paraguay', 2, 1],
  ['Nederland', 'Zweden', 1, 0], ['Duitsland', 'Ivoorkust', 2, 0], ['Ecuador', 'Curaçao', 3, 0], ['Tunesië', 'Japan', 1, 2],
  ['Spanje', 'Saoedi-Arabië', 3, 0], ['België', 'Iran', 2, 1], ['Uruguay', 'Kaapverdië', 2, 0], ['Nieuw-Zeeland', 'Egypte', 0, 2],
  ['Argentinië', 'Oostenrijk', 2, 1], ['Frankrijk', 'Irak', 2, 0], ['Noorwegen', 'Senegal', 2, 1], ['Jordanië', 'Algerije', 0, 1],
  ['Portugal', 'Oezbekistan', 2, 0], ['Engeland', 'Ghana', 2, 0], ['Panama', 'Kroatië', 1, 2], ['Colombia', 'DR Congo', 3, 0],
  // matchday 3
  ['Zwitserland', 'Canada', 1, 1], ['Bosnië-Herzegovina', 'Qatar', 2, 1], ['Marokko', 'Haïti', 3, 0], ['Schotland', 'Brazilië', 0, 2],
  ['Zuid-Afrika', 'Zuid-Korea', 1, 1], ['Tsjechië', 'Mexico', 1, 2], ['Curaçao', 'Ivoorkust', 0, 2], ['Ecuador', 'Duitsland', 1, 2],
  ['Japan', 'Zweden', 1, 1], ['Tunesië', 'Nederland', 0, 2], ['Paraguay', 'Australië', 1, 1], ['Turkije', 'Verenigde Staten', 1, 1],
  ['Uruguay', 'Spanje', 1, 2], ['Egypte', 'Iran', 1, 1], ['Nieuw-Zeeland', 'België', 0, 4], ['Jordanië', 'Argentinië', 0, 3],
  ['Noorwegen', 'Frankrijk', 1, 1], ['Senegal', 'Irak', 2, 0], ['Kaapverdië', 'Saoedi-Arabië', 1, 1], ['Kroatië', 'Ghana', 1, 0],
  ['Panama', 'Engeland', 0, 3], ['Colombia', 'Portugal', 1, 1], ['DR Congo', 'Oezbekistan', 1, 2], ['Algerije', 'Oostenrijk', 1, 2],
];
const HAKKE_LINES = [
  // matchday 1
  ['Mexico', 'Zuid-Afrika', 2, 0], ['Zuid-Korea', 'Tsjechië', 1, 1], ['Canada', 'Bosnië-Herzegovina', 1, 0], ['Verenigde Staten', 'Paraguay', 1, 1],
  ['Qatar', 'Zwitserland', 1, 2], ['Brazilië', 'Marokko', 2, 2], ['Haïti', 'Schotland', 0, 1], ['Australië', 'Turkije', 2, 1],
  ['Duitsland', 'Curaçao', 4, 0], ['Nederland', 'Japan', 1, 1], ['Ivoorkust', 'Ecuador', 1, 1], ['Zweden', 'Tunesië', 0, 1],
  ['Spanje', 'Kaapverdië', 4, 0], ['België', 'Egypte', 3, 0], ['Saoedi-Arabië', 'Uruguay', 0, 1], ['Iran', 'Nieuw-Zeeland', 1, 0],
  ['Frankrijk', 'Senegal', 2, 1], ['Irak', 'Noorwegen', 0, 1], ['Argentinië', 'Algerije', 2, 0], ['Oostenrijk', 'Jordanië', 1, 0],
  ['Portugal', 'DR Congo', 3, 0], ['Engeland', 'Kroatië', 2, 1], ['Ghana', 'Panama', 1, 0], ['Oezbekistan', 'Colombia', 0, 2],
  // matchday 2
  ['Tsjechië', 'Zuid-Afrika', 0, 0], ['Zwitserland', 'Bosnië-Herzegovina', 1, 1], ['Canada', 'Qatar', 2, 1], ['Mexico', 'Zuid-Korea', 1, 0],
  ['Verenigde Staten', 'Australië', 1, 1], ['Schotland', 'Marokko', 0, 1], ['Brazilië', 'Haïti', 3, 0], ['Turkije', 'Paraguay', 2, 1],
  ['Nederland', 'Zweden', 3, 1], ['Duitsland', 'Ivoorkust', 3, 0], ['Ecuador', 'Curaçao', 2, 0], ['Tunesië', 'Japan', 1, 2],
  ['Spanje', 'Saoedi-Arabië', 3, 0], ['België', 'Iran', 2, 0], ['Uruguay', 'Kaapverdië', 3, 0], ['Nieuw-Zeeland', 'Egypte', 1, 2],
  ['Argentinië', 'Oostenrijk', 2, 0], ['Frankrijk', 'Irak', 3, 1], ['Noorwegen', 'Senegal', 1, 1], ['Jordanië', 'Algerije', 0, 0],
  ['Portugal', 'Oezbekistan', 3, 0], ['Engeland', 'Ghana', 2, 0], ['Panama', 'Kroatië', 0, 2], ['Colombia', 'DR Congo', 2, 1],
  // matchday 3
  ['Zwitserland', 'Canada', 2, 2], ['Bosnië-Herzegovina', 'Qatar', 0, 0], ['Marokko', 'Haïti', 3, 0], ['Schotland', 'Brazilië', 1, 1],
  ['Zuid-Afrika', 'Zuid-Korea', 0, 1], ['Tsjechië', 'Mexico', 1, 1], ['Curaçao', 'Ivoorkust', 1, 1], ['Ecuador', 'Duitsland', 1, 2],
  ['Japan', 'Zweden', 2, 0], ['Tunesië', 'Nederland', 1, 1], ['Paraguay', 'Australië', 0, 1], ['Turkije', 'Verenigde Staten', 1, 1],
  ['Noorwegen', 'Frankrijk', 0, 2], ['Senegal', 'Irak', 2, 0], ['Kaapverdië', 'Saoedi-Arabië', 0, 0], ['Uruguay', 'Spanje', 1, 3],
  ['Egypte', 'Iran', 1, 1], ['Nieuw-Zeeland', 'België', 0, 2], ['Kroatië', 'Ghana', 1, 1], ['Panama', 'Engeland', 0, 3],
  ['Colombia', 'Portugal', 1, 1], ['DR Congo', 'Oezbekistan', 1, 1], ['Algerije', 'Oostenrijk', 1, 1], ['Jordanië', 'Argentinië', 0, 2],
];
const RUUB_LINES = [
  // matchday 1
  ['Mexico', 'Zuid-Afrika', 2, 1], ['Zuid-Korea', 'Tsjechië', 1, 1], ['Canada', 'Bosnië-Herzegovina', 2, 0], ['Verenigde Staten', 'Paraguay', 2, 1],
  ['Qatar', 'Zwitserland', 1, 3], ['Brazilië', 'Marokko', 2, 1], ['Haïti', 'Schotland', 0, 2], ['Australië', 'Turkije', 1, 1],
  ['Duitsland', 'Curaçao', 4, 0], ['Nederland', 'Japan', 2, 1], ['Ivoorkust', 'Ecuador', 1, 1], ['Zweden', 'Tunesië', 2, 0],
  ['Spanje', 'Kaapverdië', 3, 0], ['België', 'Egypte', 2, 1], ['Saoedi-Arabië', 'Uruguay', 0, 2], ['Iran', 'Nieuw-Zeeland', 2, 0],
  ['Frankrijk', 'Senegal', 2, 1], ['Irak', 'Noorwegen', 0, 2], ['Argentinië', 'Algerije', 3, 0], ['Oostenrijk', 'Jordanië', 2, 0],
  ['Portugal', 'DR Congo', 3, 0], ['Engeland', 'Kroatië', 2, 0], ['Ghana', 'Panama', 2, 1], ['Oezbekistan', 'Colombia', 0, 2],
  // matchday 2
  ['Tsjechië', 'Zuid-Afrika', 2, 1], ['Zwitserland', 'Bosnië-Herzegovina', 2, 0], ['Canada', 'Qatar', 2, 1], ['Mexico', 'Zuid-Korea', 2, 1],
  ['Verenigde Staten', 'Australië', 2, 0], ['Schotland', 'Marokko', 2, 1], ['Brazilië', 'Haïti', 4, 0], ['Turkije', 'Paraguay', 1, 1],
  ['Nederland', 'Zweden', 2, 1], ['Duitsland', 'Ivoorkust', 3, 1], ['Ecuador', 'Curaçao', 3, 0], ['Tunesië', 'Japan', 1, 2],
  ['Spanje', 'Saoedi-Arabië', 3, 0], ['België', 'Iran', 3, 0], ['Uruguay', 'Kaapverdië', 2, 0], ['Nieuw-Zeeland', 'Egypte', 0, 2],
  ['Argentinië', 'Oostenrijk', 2, 1], ['Frankrijk', 'Irak', 3, 0], ['Noorwegen', 'Senegal', 1, 1], ['Jordanië', 'Algerije', 2, 0],
  ['Portugal', 'Oezbekistan', 3, 0], ['Engeland', 'Ghana', 3, 1], ['Panama', 'Kroatië', 0, 2], ['Colombia', 'DR Congo', 2, 0],
  // matchday 3
  ['Zwitserland', 'Canada', 1, 1], ['Bosnië-Herzegovina', 'Qatar', 2, 1], ['Marokko', 'Haïti', 3, 0], ['Schotland', 'Brazilië', 3, 1],
  ['Zuid-Afrika', 'Zuid-Korea', 1, 1], ['Tsjechië', 'Mexico', 1, 1], ['Curaçao', 'Ivoorkust', 0, 2], ['Ecuador', 'Duitsland', 1, 2],
  ['Japan', 'Zweden', 1, 2], ['Tunesië', 'Nederland', 0, 2], ['Paraguay', 'Australië', 2, 1], ['Turkije', 'Verenigde Staten', 1, 2],
  ['Noorwegen', 'Frankrijk', 0, 2], ['Senegal', 'Irak', 2, 0], ['Kaapverdië', 'Saoedi-Arabië', 1, 1], ['Uruguay', 'Spanje', 1, 2],
  ['Egypte', 'Iran', 0, 1], ['Nieuw-Zeeland', 'België', 0, 3], ['Kroatië', 'Ghana', 2, 1], ['Panama', 'Engeland', 0, 2],
  ['Colombia', 'Portugal', 1, 2], ['DR Congo', 'Oezbekistan', 1, 1], ['Algerije', 'Oostenrijk', 1, 2], ['Jordanië', 'Argentinië', 0, 3],
];
const deFijne = { id: 'defijne', name: 'De Fijne', skill: 0.7, predMap: dutchMap(DEFIJNE_LINES), bonus: { topScorer: 'Kylian Mbappé', winnerTeamId: 'fr', mostConcededTeamId: 'ht', mostScoredTeamId: 'fr' } };
const maxim = { id: 'maxim', name: 'Maxim Breugelmans', skill: 0.7, predMap: dutchMap(MAXIM_LINES), bonus: { topScorer: 'Erling Haaland', winnerTeamId: 'es', mostConcededTeamId: 'ht', mostScoredTeamId: 'es' } };
const hakke = { id: 'hakke', name: 'Hakke', skill: 0.7, predMap: dutchMap(HAKKE_LINES), bonus: { topScorer: 'Lamine Yamal', winnerTeamId: 'fr', mostConcededTeamId: 'ht', mostScoredTeamId: 'es' } };
const ruub = { id: 'ruub', name: 'Ruub', skill: 0.7, predMap: dutchMap(RUUB_LINES), bonus: { topScorer: 'Harry Kane', winnerTeamId: 'gbeng', mostConcededTeamId: 'pa', mostScoredTeamId: 'es' } };
function dutchMapPred(p, m) {
  const h = norm(teamNlById.get(m.homeTeamId)), a = norm(teamNlById.get(m.awayTeamId));
  const d = p.predMap.get(`${h}|${a}`); if (d) return { home: d[0], away: d[1] };
  const r = p.predMap.get(`${a}|${h}`); if (r) return { home: r[1], away: r[0] };
  return null;
}
const REAL = [barry, deFijne, maxim, hakke, ruub];
const participants = NO_DUMMIES ? REAL : [...REAL, ...dummies];

// Barry's provided group predictions (keyed by normalised home|away).
const USER_LINES = [
  ['Mexico', 'South Africa', 1, 0], ['South Korea', 'Czech Republic', 1, 1], ['Canada', 'Bosnia and Herzegovina', 2, 0], ['United States', 'Paraguay', 2, 0],
  ['Qatar', 'Switzerland', 0, 2], ['Brazil', 'Morocco', 2, 0], ['Haiti', 'Scotland', 0, 2], ['Australia', 'Turkey', 0, 2],
  ['Germany', 'Curaçao', 4, 1], ['Ivory Coast', 'Ecuador', 0, 0], ['Netherlands', 'Japan', 2, 2], ['Sweden', 'Tunisia', 2, 0],
  ['Belgium', 'Egypt', 2, 0], ['Iran', 'New Zealand', 2, 0], ['Saudi Arabia', 'Uruguay', 0, 2], ['Spain', 'Cape Verde', 3, 0],
  ['France', 'Senegal', 2, 0], ['Iraq', 'Norway', 0, 3], ['Argentina', 'Algeria', 2, 0], ['Austria', 'Jordan', 3, 0],
  ['Portugal', 'DR Congo', 2, 0], ['Uzbekistan', 'Colombia', 0, 2], ['England', 'Croatia', 2, 0], ['Ghana', 'Panama', 2, 0],
  ['Czech Republic', 'South Africa', 2, 0], ['Mexico', 'South Korea', 2, 0], ['Canada', 'Qatar', 3, 0], ['Switzerland', 'Bosnia and Herzegovina', 3, 0],
  ['Brazil', 'Haiti', 4, 1], ['Scotland', 'Morocco', 0, 2], ['Turkey', 'Paraguay', 2, 0], ['United States', 'Australia', 2, 1],
  ['Ecuador', 'Curaçao', 3, 0], ['Germany', 'Ivory Coast', 3, 0], ['Netherlands', 'Sweden', 3, 1], ['Tunisia', 'Japan', 0, 2],
  ['Belgium', 'Iran', 3, 0], ['New Zealand', 'Egypt', 0, 2], ['Spain', 'Saudi Arabia', 3, 1], ['Uruguay', 'Cape Verde', 3, 0],
  ['France', 'Iraq', 3, 0], ['Norway', 'Senegal', 2, 1], ['Argentina', 'Austria', 2, 0], ['Jordan', 'Algeria', 0, 3],
  ['Colombia', 'DR Congo', 2, 0], ['Portugal', 'Uzbekistan', 3, 0], ['England', 'Ghana', 3, 0], ['Panama', 'Croatia', 0, 3],
  ['Mexico', 'Czech Republic', 2, 0], ['South Africa', 'South Korea', 0, 2], ['Bosnia and Herzegovina', 'Qatar', 3, 0], ['Canada', 'Switzerland', 1, 2],
  ['Morocco', 'Haiti', 3, 0], ['Scotland', 'Brazil', 0, 3], ['Paraguay', 'Australia', 2, 0], ['United States', 'Turkey', 1, 3],
  ['Curaçao', 'Ivory Coast', 0, 3], ['Ecuador', 'Germany', 0, 2], ['Japan', 'Sweden', 2, 0], ['Tunisia', 'Netherlands', 0, 3],
  ['Egypt', 'Iran', 2, 0], ['New Zealand', 'Belgium', 0, 3], ['Cape Verde', 'Saudi Arabia', 0, 2], ['Uruguay', 'Spain', 0, 2],
  ['Norway', 'France', 1, 2], ['Senegal', 'Iraq', 2, 0], ['Algeria', 'Austria', 0, 2], ['Jordan', 'Argentina', 1, 3],
  ['Colombia', 'Portugal', 1, 2], ['DR Congo', 'Uzbekistan', 2, 0], ['Croatia', 'Ghana', 2, 0], ['Panama', 'England', 0, 3],
];
const USER_PRED = new Map(USER_LINES.map(([h, a, gh, ga]) => [`${norm(h)}|${norm(a)}`, [gh, ga]]));
function barryGroupPred(m) {
  const h = norm(teamEnById.get(m.homeTeamId)), a = norm(teamEnById.get(m.awayTeamId));
  const direct = USER_PRED.get(`${h}|${a}`);
  if (direct) return { home: direct[0], away: direct[1] };
  const rev = USER_PRED.get(`${a}|${h}`);
  if (rev) return { home: rev[1], away: rev[0] };
  return null;
}

// ---- predictions: group matches first (phase-stable), then knockout ----
const predictions = [];
const addPred = (pid, m, pred) => { if (pred) predictions.push({ participantId: pid, matchId: m.id, home: pred.home, away: pred.away }); };
for (const stage of ['group', 'ko']) {
  for (const p of participants) {
    for (const m of matches) {
      const isGroup = m.round === 'group';
      if (stage === 'group' !== isGroup) continue;
      if (!m.homeTeamId || !m.awayTeamId) continue; // unresolved knockout slot
      let pred;
      if (isGroup) {
        if (p.id === 'barry') pred = barryGroupPred(m);
        else if (p.predMap) pred = dutchMapPred(p, m); // De Fijne / Maxim: only their read predictions (may be null -> skip)
        else pred = m.result ? predictFromResult(m.result, p.skill) : plausible();
      } else {
        if (p.predMap) pred = null; // De Fijne / Maxim: no knockout predictions provided
        else pred = m.result ? predictFromResult(m.result, p.skill) : plausible();
      }
      addPred(p.id, m, pred);
    }
  }
}

// ---- scorers + bonus outcomes ----
const goalsSeq = [7, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1];
const scorers = NO_RESULTS ? [] : PLAYERS.map(([player, iso], i) => ({ player, teamId: idOf(iso), goals: goalsSeq[i] ?? 1 }));

const outcomes = { topScorer: '', winnerTeamId: '', mostConcededTeamId: '', mostScoredTeamId: '' };
if (PHASE === 'final') {
  outcomes.winnerTeamId = winners['final-1'] ?? '';
  outcomes.topScorer = scorers[0].player;
  const tally = Object.fromEntries(teams.map((t) => [t.id, { s: 0, c: 0 }]));
  for (const m of matches) {
    if (!m.result || !m.homeTeamId || !m.awayTeamId) continue;
    tally[m.homeTeamId].s += m.result.home; tally[m.homeTeamId].c += m.result.away;
    tally[m.awayTeamId].s += m.result.away; tally[m.awayTeamId].c += m.result.home;
  }
  outcomes.mostScoredTeamId = Object.entries(tally).sort((a, b) => b[1].s - a[1].s)[0][0];
  outcomes.mostConcededTeamId = Object.entries(tally).sort((a, b) => b[1].c - a[1].c)[0][0];
}

const settings = { multipliers: { group: 1, r32: 2, r16: 3, qf: 4, sf: 4, third: 4, final: 5 }, bonusPoints: 30 };

const participantsOut = participants.map(({ skill, predMap, ...p }) => p);
const write = (name, data) => writeFileSync(join(DATA, name), JSON.stringify(data, null, 2) + '\n');
write('teams.json', teamsOut);
write('groups.json', groups);
write('matches.json', matches);
write('participants.json', participantsOut);
write('predictions.json', predictions);
write('scorers.json', scorers);
write('outcomes.json', outcomes);
write('settings.json', settings);

const played = matches.filter((m) => m.status === 'finished').length;
console.log(`[phase=${PHASE}] ${teamsOut.length} teams, ${matches.length} matches (${played} played), ${participantsOut.length} contestants, ${predictions.length} predictions.`);
if (PHASE === 'final') console.log(`Champion: ${teams.find((t) => t.id === winners['final-1'])?.name}`);
