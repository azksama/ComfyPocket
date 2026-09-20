# Validation Mochi 0.9.0

20 septembre 2026.

- TypeScript et compilation Vite : réussis.
- 38 tests Vitest et 22 tests Node/PowerShell : réussis.
- 42 parcours Playwright : réussis. Navigation des six sections, préférence gaucher après rechargement, verrouillage, annulation et relance de l’authentification, paramètres, galerie et prompts couverts.
- Après le dernier ajustement de la bulle compacte : les quatre tests de bibliothèque/éditeur sont repassés, dont le viewport 320 × 317 avec contrôle des limites du champ, des suggestions et du pied de page.
- APK ARM64 release signé et APK x86_64 debug compilés. Signature Android identique aux versions précédentes. Les dix ressources d’icônes restent identiques.

## Android réel sur émulateur

Émulateur Android API 36, x86_64, écran 720 × 1280, densité 2. Installation par-dessus la version précédente ; stockage local et profils conservés. Connexion HTTPS native au compagnon et lecture des informations du PC réussies.

La surface WebView mesure 360 × 592 sans clavier et 360 × 317 avec l’IME affiché. La barre système est en dehors de la surface de contenu et conserve le fond lavande. Les raccourcis mesurent 38 × 218, à 3 px du bord et centrés verticalement. Le mode gaucher a été actionné dans les paramètres.

Avec le clavier ouvert : champ de prompt entre y=157 et y=269, bulle entre y=196,8 et y=263,8, actions entre y=275 et y=313. La sélection d’un tag puis la validation du prompt fonctionnent.

Verrouillage natif testé avec un code Android temporaire : activation, verrouillage immédiat, annulation de la demande, bouton « Le libérer », nouvelle demande et authentification réussie. La protection et le code temporaires ont ensuite été retirés de l’émulateur. Les profils de test ont été supprimés.

Les phases visuelles du saut ont été inspectées : préparation yeux fermés, saut yeux ouverts, réception yeux fermés, repos yeux ouverts. La durée de l’écran de lancement est de 2,6 secondes ; la réduction des animations désactive le mouvement.

## Limites

Pas de téléphone physique connecté : capteur d’empreinte, clavier Samsung, versions Android antérieures à l’API 36 et réseau mobile non testés durant cette livraison. Le moteur de génération et le compagnon PC ne sont pas modifiés.
