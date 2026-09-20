# Validation Mochi 0.9.1

20 septembre 2026.

## Changements

Le fond natif distingue la zone supérieure (`#faf8fc`) de la barre de navigation Android (`#f0eaf6`), sans modifier les insets du clavier. Les raccourcis ne réservent plus d’espace horizontal. L’en-tête utilise la mascotte existante ; les profils ont un espacement de 18 px.

La navigation termine la page demandée lors des événements de visibilité et de reprise, annule les gestes interrompus et retire sa transformation au repos. La fin d’une ancienne animation ne peut plus modifier la nouvelle navigation. Un délai de secours couvre également les animations suspendues ou annulées sans événement de cycle de vie. Aucun rechargement ni remontage des formulaires.

## Vérifications

- TypeScript/Vite et 38 tests Vitest + 22 tests Node/PowerShell réussis.
- Scénarios ciblés : animations interrompues, annulées et suspendues, champs conservés, navigation successive, largeur disponible, quatre en-têtes et profils espacés. Les trois scénarios de navigation ont été répétés trois fois avec succès après le dernier correctif.
- Émulateur Android API 36 x86_64 : installation en mise à jour, stockage conservé et connexion HTTPS au compagnon réussis.
- Quatre cycles Android Home → reprise, un par page, avec animation suspendue : contenu visible, transformation finale `none`, valeur et nœud du champ Steps conservés.
- Mesure sur capture Android : le fond sous le geste système et celui du menu sont tous deux RGB (240, 234, 246). La zone supérieure reste RGB (250, 248, 252).
- Espacement des profils contrôlé dans le navigateur et sur Android ; captures des quatre pages après reprise inspectées.

## Limites

Le défaut intermittent précis du téléphone Samsung n’est pas reproduit sur ce matériel. Les cas d’interruption de navigation sont reproduits et corrigés, mais la confirmation sur le téléphone de l’utilisateur reste nécessaire. Aucun test sur capteur biométrique physique ou réseau mobile pendant cette livraison. Aucun changement au compagnon PC.
