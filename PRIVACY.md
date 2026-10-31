# Politique de confidentialité - Don't Feed

Dernière mise à jour : 31 octobre 2026

**Don't Feed ne collecte, ne stocke sur un serveur, ne vend ni ne transmet aucune donnée personnelle.**

## Ce qui reste sur ton appareil

Tout est enregistré localement dans ton navigateur (stockage de l'extension) :
- tes listes (noms, variantes, liens de profils, sites bloqués, exceptions) ;
- tes réglages (mode flou ou masquage, sites en pause) ;
- les cases « bloqué » cochées dans l'onglet « Bloquer à la source » ;
- le compteur de contenus masqués (un nombre par jour), affiché dans la popup. Il ne quitte jamais ton appareil.

Le contenu des pages que tu visites est analysé **dans ton navigateur uniquement**, pour masquer les blocs qui citent un nom de tes listes. Rien n'en sort.

## Seule connexion réseau

L'extension télécharge les listes auxquelles **tu** t'abonnes (dont la liste de départ, hébergée sur GitHub), au moment de l'abonnement puis toutes les 12 heures. Ces requêtes ne contiennent aucune information sur toi au-delà de ce que tout téléchargement révèle (adresse IP, navigateur) à l'hébergeur de la liste.

Pas de statistiques envoyées, pas de traceurs, pas de compte utilisateur, pas de publicité.

## Permissions demandées

- **Accès à tous les sites** : nécessaire pour masquer les contenus sur n'importe quelle page.
- **storage** : enregistrer tes listes et réglages localement.
- **contextMenus** : le clic droit « Bloquer ».
- **alarms** : mettre à jour les listes toutes les 12 heures.
- **declarativeNetRequest** : remplacer les sites que tu as bloqués par un écran de blocage.
- **scripting** : activer l'extension dans les onglets déjà ouverts au moment de l'installation ou d'une mise à jour, sans avoir à les recharger.

## Supprimer tes données

Désinstaller l'extension efface tout. Tu peux aussi vider chaque liste depuis la page des réglages.

## Contact

Écris à far_right_blocker@proton.me ou ouvre une issue sur https://github.com/dontfeed-app/dontfeed
