# Don't Feed : Far right content blocker

Extension Chrome et Firefox qui masque, sur tous les sites, les contenus qui citent les personnalités, comptes et médias de tes listes de blocage. Une sorte d'uBlock Origin, mais pour les personnes plutôt que pour les pubs.

Inspirée du mouvement brésilien « Senta o dedo no block », qui part d'un constat simple : les algorithmes mettent en avant ce qui fait réagir, sans distinguer le soutien de la critique.

## Les 3 règles

1. **Tu ne commentes plus.** Même pour clasher.
2. **Tu ne partages plus.** Pour montrer : une capture, pas un lien.
3. **Tu bloques.** Le compte, le média, l'influenceur.

Don't Feed aide aux trois : le flou évite de cliquer ou de commenter par réflexe, et l'onglet « Bloquer à la source » guide le blocage compte par compte.

## Ce que ça fait

- **Masque ou floute** les vidéos, posts, commentaires et articles qui citent un nom de ta liste (YouTube, X, Facebook, Instagram, TikTok, Reddit, LinkedIn, Bluesky, Threads, Google, Google Actualités, et en mode générique sur tous les autres sites, médias compris). En mode flou, un clic révèle le bloc.
- **Bloquer en un clic** : sélectionne un nom sur n'importe quelle page, clic droit, « Bloquer ». Clic droit sur un lien : « Bloquer le site de ce lien ».
- **Listes partageables** : tu peux t'abonner à des listes publiées par d'autres (une URL), mises à jour automatiquement toutes les 12 h, comme les listes de filtres d'uBlock.
- **Bloquer à la source** : pour chaque personne, des liens vers ses comptes. Une page dédiée te les présente un par un pour que tu les bloques toi-même sur chaque plateforme, avec une case « fait ». C'est ce qui agit vraiment sur l'algorithme.
- **Sites bloqués** : un domaine entier peut être remplacé par un écran de blocage, et les liens vers lui sont masqués ailleurs.
- **Exceptions** : noms à ne jamais bloquer, même s'ils figurent dans une liste d'abonnement.
- **Tout est local** : aucune donnée envoyée, aucun serveur (le compteur reste sur l'appareil). Le seul trafic réseau est le téléchargement des listes auxquelles tu t'abonnes.
- **Pas sur tes messageries** : Gmail, Outlook, WhatsApp Web, Messenger, Slack, Discord, etc. sont en pause par défaut (rien d'algorithmique, et tes conversations privées restent intactes). Réactivables dans Réglages.

## Où ça marche

Dans **Chrome, Edge, Brave ou Firefox sur ordinateur** : YouTube, X, Instagram, Facebook, TikTok, Bluesky, Reddit, LinkedIn, Threads, Google (y compris Google Images et le panneau de connaissances) et les sites de presse, dans leur **version web**.

**Pas dans les applis mobiles** (Instagram, TikTok, X sur téléphone) : une extension de navigateur ne peut pas agir dedans. Sur mobile, ce qui marche, c'est la règle 3 : bloquer les comptes, qui s'applique ensuite partout, appli comprise. Pour ça, il y a une **page web mobile** : [dontfeed-app.github.io/dontfeed/mobile/](https://dontfeed-app.github.io/dontfeed/mobile/). Elle présente les comptes un par un ; le bouton ouvre le profil directement dans l'appli (Instagram, TikTok, X...), tu bloques, tu reviens, compte suivant. Pas de store, pas de compte, la progression reste sur le téléphone. Le blocage fait sur ordinateur vaut aussi sur le téléphone.

Testé en conditions réelles (octobre 2026) sur YouTube (recherche, Shorts, étagères), Google et Bluesky. X, Instagram, Facebook et TikTok demandent une connexion : les sélecteurs sont en place mais à vérifier avec un compte.

## Installer (développement)

**Chrome / Edge / Brave**
1. Télécharge le repo (bouton Code > Download ZIP) et dézippe-le.
2. Va sur `chrome://extensions`, active le **Mode développeur** (en haut à droite).
3. « Charger l'extension non empaquetée » et choisis le dossier.

**Firefox** (142 ou plus récent)
1. Va sur `about:debugging#/runtime/this-firefox`.
2. « Charger un module complémentaire temporaire » et choisis `manifest.json`.
   (Temporaire = retiré au redémarrage de Firefox. Pour une installation permanente, il faut publier sur addons.mozilla.org.)

## Format des listes

### JSON

```json
{
  "title": "Nom de la liste",
  "entries": [
    {
      "name": "Prénom Nom",
      "aliases": ["P. Nom", "@pseudo"],
      "accounts": ["https://x.com/pseudo", "https://www.instagram.com/pseudo/"],
      "source": "https://lien-qui-justifie-l-ajout",
      "note": "Une phrase de contexte"
    }
  ],
  "domains": ["exemple.fr"]
}
```

Seul `name` est obligatoire. `aliases` = autres façons dont la personne est écrite (variantes, pseudos). `accounts` = profils à bloquer à la source.

Garde-fou : un terme d'un seul mot de moins de 5 lettres est ignoré (sinon « Diaz » masquerait Cameron Diaz). Pour un sigle voulu, préfixe-le par `!` : `"!AfD"`. `"matchName": false` = le nom affiché n'est pas cherché (utile quand c'est un mot courant, comme « Vox » ou « Reconquête »).

### Texte

```
! Title: Nom de la liste
# commentaire
Prénom Nom | P. Nom | @pseudo | https://x.com/pseudo
domain:exemple.fr
```

Exemples complets dans [`listes/`](listes/).

### Publier une liste

1. Exporte ta liste depuis l'extension (Ma liste > Exporter) ou écris-la à la main.
2. Mets-la dans un repo GitHub (par ex. dans `listes/`), ouvre le fichier, clique sur **Raw** et copie l'adresse (`https://raw.githubusercontent.com/...`).
3. Partage cette adresse : les autres la collent dans Abonnements.

## Fonctionnement technique

- `lib/core.js` : lecture des listes, normalisation (minuscules, sans accents) et détection des noms en mot entier.
- `content.js` : script injecté dans chaque page. Il repère les « blocs » (une vidéo, un post...) via des sélecteurs propres à chaque site, ou remonte au bloc le plus proche en mode générique. Un `MutationObserver` re-filtre au fil du scroll infini.
- `background.js` : menus clic droit, téléchargement des abonnements, règles `declarativeNetRequest` (l'API du navigateur pour rediriger les sites bloqués), badge du compteur.
- `popup.*`, `options.*`, `blocked.*` : interface.

Les sélecteurs par site sont en haut de `content.js` (`SITES`). Les plateformes changent leur HTML régulièrement : si un site ne filtre plus, c'est là qu'il faut corriger.

## Limites connues

- Ça ne détecte que ce qui **nomme** quelqu'un de la liste. Un contenu qui ne cite aucun nom passe.
- Faux positifs : un article critique ou une analyse qui cite un nom est masqué aussi. Le mode flou permet de révéler au cas par cas.
- Homonymes : un nom courant bloquera d'autres personnes. Préfère les noms complets et les @pseudos.
- Masquer dans ton navigateur n'a **aucun effet sur l'algorithme** de la plateforme. Pour ça, il faut bloquer le compte sur la plateforme (onglet « Bloquer à la source »).
- L'extension ne bloque pas les comptes automatiquement : les plateformes l'interdisent et suspendent les comptes qui le font.

## Liste de départ

[`listes/fr-depart.json`](listes/fr-depart.json) : une petite liste de test (dirigeants et partis), proposée en un clic à l'ouverture de l'extension. Critères :

- uniquement des **personnalités publiques et organisations**, jamais de particuliers ;
- chaque entrée a une **source publique** : la circulaire de l'Intérieur du 2 février 2026 sur les nuances électorales, qui classe le RN et l'UDR dans le bloc « extrême droite » (recours rejetés par le Conseil d'État le 27 février 2026, n° 512694), ou un article de presse pour Reconquête et ses figures ;
- **appartenance au parti et comptes officiels relevés sur Wikidata** (base collaborative liée à Wikipédia) le 28/10/2026, avec un lien vers la fiche de chaque personne. Les cas où l'appartenance semblait périmée ont été écartés. À revérifier régulièrement : les pseudos et les étiquettes changent.

Pour proposer un ajout : une pull request avec nom, comptes et source.

## International

L'interface est traduite en français, anglais, espagnol, portugais, allemand et italien (langue du navigateur, ou réglage « Langue »). Le message reste le même partout : les 3 règles, le flou, le blocage à la source. Seule la liste de départ change selon le pays, choisie au premier lancement et modifiable dans Abonnements.

| Pays | Liste | Pourquoi ce pays | Source de la qualification |
| --- | --- | --- | --- |
| France | [`fr-depart.json`](listes/fr-depart.json) | Présidentielle et législatives 2027 | Circulaire de l'Intérieur (2 février 2026), Conseil d'État |
| Espagne | [`es.json`](listes/es.json) | Législatives 2027, Vox en forte hausse | [Carnegie Europe, sept. 2026](https://carnegieendowment.org/europe/research/2026/09/how-europes-2027-elections-could-test-eu-governance) |
| Italie | [`it.json`](listes/it.json) | Législatives 2027 : Fratelli d'Italia, la Ligue, Futuro Nazionale (Vannacci) | NBC (FdI), Reuters 25/10/2026 (Ligue), [Reuters, juin 2026](https://www.internazionale.it/ultime-notizie-reuters/2026/06/14/italian-general-launches-far-right-party-threatening-meloni-s-election-hopes) (Vannacci) |
| Pologne | [`pl.json`](listes/pl.json) | Législatives 2027 | [Notes from Poland, janv. 2026](https://notesfrompoland.com/2026/01/07/polish-far-right-leader-braun-names-man-on-trial-for-russian-espionage-as-election-candidate/) |
| Allemagne | [`de.json`](listes/de.json) | AfD en tête des sondages (fédérales en 2029) | [VG Köln, 26 févr. 2026](https://www.beck-aktuell.de/heute-im-recht/rechtsprechung/vg-koeln-13l1109-25-einstufung-afd-gesichert-rechtsextremistisch-2026-02-26) : « Verdachtsfall » rechtsextremistisch |
| États-Unis | [`us.json`](listes/us.json) | Midterms du 3 novembre 2026 ; figures médiatiques (Loomer, Alex Jones, Fuentes, Bannon), pas d'élus | PBS, Political Research Associates, NBC |
| Brésil | [`br.json`](listes/br.json) | Pays d'origine du mouvement (présidentielle d'octobre 2026 passée) | [RTP, sept. 2025](https://www.rtp.pt/noticias/mundo/bolsonaro-condenado-a-27-anos-e-tres-meses-de-prisao-por-golpe-de-estado_n1683088) |

Les listes étrangères sont volontairement courtes : un parti et ses figures nationales, chacune avec une source qui emploie le terme « extrême droite » (ou une décision officielle). Elles gagneraient à être relues par des gens du pays : les pull requests sont les bienvenues.

## Compteur

L'extension compte les contenus masqués (aujourd'hui, 7 jours, 30 jours, au total), affichés dans la popup et en haut de la page de l'extension. Le compteur est stocké uniquement sur l'appareil : rien n'est envoyé.

## Ce qui existe déjà

- **Listes de modération Bluesky** : natif sur Bluesky, on s'abonne à une liste pour bloquer ou masquer tous ses comptes d'un coup (des listes françaises existent). C'est le plus efficace, mais limité à Bluesky.
- **Shinigami Eyes** (Chrome, Firefox) : colore les liens vers des comptes jugés transphobes, d'après des signalements collectifs. Même logique de liste partagée, autre cible, et pas de masquage.
- **Trump Filter** (2016, Chrome) : masquait tout contenu citant Donald Trump. Même principe que le filtrage ici, pour une seule personne.
- **Block Together** (X/Twitter) : partage de listes de blocage entre comptes, mort depuis la fermeture de l'API de Twitter.

Don't Feed combine les deux approches : filtrage multi-sites dans le navigateur, et aide au blocage à la source sur chaque plateforme.

## Sur le contenu des listes

Chacun choisit qui il bloque, ou à quelle liste il fait confiance. Si tu publies une liste, indique pour chaque entrée une `source` (article, décision, déclaration) qui justifie l'ajout : ça rend la liste vérifiable, plus crédible, et ça évite d'y mettre quelqu'un par erreur.

## Publier l'extension

- **Chrome Web Store** : compte développeur (frais unique de 5 $), zip du dossier, fiche, politique de confidentialité (ici : « aucune donnée collectée »).
- **Firefox (AMO)** : gratuit, zip du dossier sur addons.mozilla.org.

## Contribuer

Issues et pull requests bienvenues, en particulier pour corriger ou ajouter des sélecteurs de sites.

Contact : far_right_blocker@proton.me

## Publier

Voir [STORE.md](STORE.md) (fiche, justification des permissions, étapes) et [PRIVACY.md](PRIVACY.md). `./scripts/build.sh` crée le zip à envoyer.

## Licence

MIT, voir [LICENSE](LICENSE).
