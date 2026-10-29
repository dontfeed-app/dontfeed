const assert = require('assert');
const F = require('../lib/core.js');
const m = F.buildMatcher(['Jean Exemple', '@jeanexemple', 'ab', 'Média Fictif']);
assert.equal(m('Interview de JEAN  exemple hier'), 'jean exemple');
assert.equal(m('Jean Exemplaire'), null);              // mot entier
assert.equal(m('suivez @jeanexemple !'), '@jeanexemple');
assert.equal(m('@jeanexemple_fan'), null);
assert.equal(m('le media fictif dit'), 'media fictif'); // accents ignorés
assert.equal(m('abc ab'), null);                        // < 3 car. ignoré
assert.equal(F.buildMatcher([]), null);
const fs = require('fs');
const j = F.parseList(fs.readFileSync(__dirname + '/../listes/exemple.json', 'utf8'));
assert.equal(j.entries.length, 2); assert.equal(j.entries[0].accounts.length, 3); assert.deepEqual(j.domains, ['media-fictif.example']);
const t = F.parseList(fs.readFileSync(__dirname + '/../listes/exemple.txt', 'utf8'));
assert.equal(t.title.startsWith("Liste d'exemple"), true);
assert.deepEqual(t.entries[0].aliases, ['J. Exemple', '@jeanexemple']);
assert.deepEqual(t.entries[0].accounts, ['https://x.com/jeanexemple']);
assert.deepEqual(t.domains, ['media-fictif.example']);
const c = F.collect({ personal: { entries: [{ name: 'Perso Un' }], domains: [], allow: ['jean exemple'] }, subscriptions: [{ title: 's', ...j }, { enabled: false, entries: [{ name: 'Off' }] }] });
assert.ok(!c.terms.includes('Jean Exemple')); assert.ok(c.terms.includes('Perso Un')); assert.ok(!c.terms.includes('Off'));
assert.equal(F.domainMatches('www.sub.media-fictif.example', c.domains), 'media-fictif.example');
assert.equal(F.cleanDomain('https://www.Exemple.fr/page'), 'exemple.fr');
console.log('core OK');
// liste de départ
const d = F.parseList(fs.readFileSync(__dirname + '/../listes/fr-depart.json', 'utf8'));
assert.ok(d.entries.length >= 5);
for (const e of d.entries) { assert.ok(e.source, 'source manquante: ' + e.name); assert.ok((e.accounts || []).length, 'comptes: ' + e.name); }
const md = F.buildMatcher(F.collect({ subscriptions: [d] }).terms);
assert.equal(md('la reconquête spatiale'), null);           // mot courant non filtré
assert.equal(md('meeting du parti Reconquête'), 'parti reconquete');
assert.equal(md('Bardella en visite'), 'bardella');
console.log('starter OK');
// clés de compte
assert.equal(F.accountKey('https://twitter.com/J_Bardella/status/123'), 'x.com|/j_bardella');
assert.equal(F.accountKey('/@J_Bardella/shorts', 'https://www.youtube.com/shorts/x'), 'youtube.com|/@j_bardella');
assert.equal(F.accountKey('https://www.youtube.com/channel/UC3U0VIDgANFaXeOAtt1m5Mw'), 'youtube.com|/channel/uc3u0vidganfaxeoatt1m5mw');
assert.equal(F.accountKey('/watch?v=abc', 'https://www.youtube.com/'), null);
assert.equal(F.accountKey('https://www.instagram.com/p/xyz/'), null);
const cc = F.collect({ subscriptions: [d] });
assert.equal(cc.accounts.get('x.com|/j_bardella'), 'Jordan Bardella');
console.log('accounts OK');
// garde-fou mots courts, pause par suffixe
const g = F.buildMatcher(['the', 'Diaz', 'Le Pen', '@rn', 'Aliot']);
assert.equal(g('the end'), null);
assert.equal(g('Cameron Diaz'), null);
assert.equal(g('Marine Le Pen'), 'le pen');
assert.equal(g('vu sur @rn'), '@rn');
assert.equal(g('Louis Aliot'), 'aliot');
assert.ok(F.isPaused('equipe.slack.com', F.DEFAULT_PAUSED));
assert.ok(F.isPaused('www.claude.ai', F.DEFAULT_PAUSED));
assert.ok(!F.isPaused('youtube.com', F.DEFAULT_PAUSED));
console.log('safety OK');
// alias forcé
const mf = F.buildMatcher(['!AfD', 'xyz']);
assert.equal(mf('Die AfD liegt vorne'), 'afd');
assert.equal(mf('xyz'), null);
const de = F.parseList(fs.readFileSync(__dirname + '/../listes/de.json', 'utf8'));
assert.equal(F.collect({ subscriptions: [de] }).names.get('afd'), 'Alternative für Deutschland');
console.log('forced OK');
// compteur
let s = F.addHits(null, 3, new Date('2026-10-28T10:00:00'));
s = F.addHits(s, 2, new Date('2026-10-28T12:00:00'));
s = F.addHits(s, 5, new Date('2026-10-20T12:00:00'));
const sum = F.summarize(s, new Date('2026-10-28T20:00:00'));
assert.deepEqual([sum.today, sum.week, sum.month, sum.total], [5, 5, 10, 10]);
assert.equal(F.defaultCountry('es-ES'), 'ES'); assert.equal(F.defaultCountry('pt-BR'), 'BR'); assert.equal(F.defaultCountry('en-US'), 'US');
for (const k of ['es', 'de', 'br', 'it', 'pl', 'us']) { const L = F.parseList(fs.readFileSync(__dirname + '/../listes/' + k + '.json', 'utf8')); for (const e of L.entries) assert.ok(e.source, k + ' ' + e.name); }
const I = require('../lib/i18n.js'); I.setLang('de'); assert.equal(I.t('masked', { n: 'X' }), 'Ausgeblendet: X');
console.log('stats/i18n OK');
