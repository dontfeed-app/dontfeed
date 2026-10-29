# Fiche pour le Chrome Web Store et addons.mozilla.org

## Nom
Don't Feed

## Résumé (132 caractères max)
Masque les contenus des personnalités d'extrême droite sur tous les sites, et t'aide à bloquer leurs comptes sur les réseaux.

## Contact (email de support et du compte développeur)

far_right_blocker@proton.me

## Catégorie
Chrome : Productivité (ou « Réseaux sociaux et communication »). Firefox : Réseaux sociaux / Confidentialité et sécurité.

## Description

Ne leur donne pas d'audience.

Les réseaux sociaux mettent en avant ce qui fait réagir. Une vue, un commentaire indigné, un partage pour se moquer : l'algorithme ne fait pas la différence avec un like. Il y voit de l'intérêt et montre ce contenu à encore plus de monde. Le plus efficace, c'est de ne pas réagir du tout. Don't Feed t'y aide.

**Les 3 règles**
1. Tu ne commentes plus. Même pour clasher.
2. Tu ne partages plus. Pour montrer : une capture, pas un lien.
3. Tu bloques. Le compte, le média, l'influenceur.

**Masquer partout**
Les vidéos, posts, commentaires et articles qui citent une personne de tes listes sont floutés ou masqués : YouTube, X, Facebook, Instagram, TikTok, Reddit, LinkedIn, Bluesky, Threads, Google, et les sites de médias. Un clic révèle un contenu flouté si tu veux le voir.

**Bloquer à la source**
Masquer dans ton navigateur ne change rien pour l'algorithme. Bloquer le compte sur la plateforme, si. Don't Feed liste les comptes officiels de chaque personne, avec un lien direct et une case à cocher, pour les bloquer un par un sur chaque réseau.

**Listes partagées**
Une liste de départ sourcée est proposée en un clic. Tu peux aussi t'abonner à d'autres listes (une simple adresse), créer la tienne, l'exporter et la partager. Ajoute un nom en le sélectionnant sur n'importe quelle page, clic droit, « Bloquer ».

**Respect de ta vie privée**
Aucune donnée collectée. Tout reste dans ton navigateur. Code source ouvert : https://github.com/dontfeed-app/dontfeed

## Justification des permissions (formulaire Chrome)

- Accès aux sites (host permissions) : le cœur de l'extension est de masquer, sur n'importe quel site, les blocs de contenu qui citent un nom choisi par l'utilisateur. L'analyse a lieu localement.
- storage : enregistrer localement les listes et réglages de l'utilisateur.
- contextMenus : ajouter un nom ou un site à la liste par clic droit.
- alarms : mettre à jour toutes les 12 h les listes auxquelles l'utilisateur s'est abonné.
- declarativeNetRequest : rediriger vers une page de blocage les sites que l'utilisateur a choisi de bloquer.
- scripting : injecter les scripts de l'extension dans les onglets déjà ouverts lors de l'installation ou d'une mise à jour (sinon l'utilisateur devrait recharger chaque onglet).
- Code distant : aucun. Les listes téléchargées sont des données (JSON/texte), jamais du code exécuté.

## Usage des données (formulaire Chrome)
Ne collecte aucune catégorie de données. Cocher les trois attestations (pas de vente, pas d'usage hors fonction principale, pas d'usage pour la solvabilité).

## Politique de confidentialité
https://github.com/dontfeed-app/dontfeed/blob/main/PRIVACY.md

## Captures à fournir
1280 x 800 : page « Bloquer à la source », un fil YouTube avec contenus floutés, la popup.

## Étapes
1. `./scripts/build.sh` crée `dist/dontfeed-<version>.zip`.
2. Chrome : https://chrome.google.com/webstore/devconsole (compte développeur, 5 $ une fois), « Nouvel élément », envoyer le zip, remplir la fiche ci-dessus.
3. Firefox : https://addons.mozilla.org/developers/ , « Soumettre un module », envoyer le même zip. Le manifeste déclare déjà « aucune collecte de données », requis par Mozilla pour les nouvelles extensions.

À prévoir : un examen manuel plus long à cause de l'accès à tous les sites, et un refus possible si une plateforme estime la fiche trop politique. Rester factuel dans la description aide.
