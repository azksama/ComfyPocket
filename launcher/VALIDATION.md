# Mochi Studio 0.1.0 — validation Windows

Vérifié le 22 septembre 2026 sur l’installation Stability Matrix du PC (RTX 4070 SUPER).

- Compilation TypeScript/Vite, Rust et installateur NSIS x64 réussies.
- 40 tests Vitest, 24 tests Node/PowerShell et 2 tests Rust réussis.
- Reconnaissance du processus ComfyUI et du relais Python Windows venv ; rejet d’un autre processus Python.
- Refus d’arrêt avec des images en attente, avant de toucher aux processus.
- Arrêt puis démarrage complets depuis l’interface native de développement.
- Installation silencieuse, lancement du binaire installé et démarrage réel des deux services avec le Node inclus.
- HTTPS authentifié et moteur vérifiés depuis Rust ; informations réelles du GPU affichées.
- Certificat, clé et deux fichiers d’appairage inchangés octet pour octet lors du démarrage installé.
- Modification, enregistrement puis restauration des paramètres depuis l’interface native.
- Quatre vues contrôlées avec axe (WCAG 2 A/AA) : aucune violation détectée après correction du contraste des textes secondaires.
- Rendus d’accueil et de paramètres créés et exportés depuis pen.dev.

Limites : pas de redémarrage physique de Windows pendant cette validation, pas de test depuis le téléphone ni depuis un réseau mobile. Le réglage du pare-feu nécessite l’élévation Windows. L’installateur n’est pas signé avec un certificat éditeur commercial.


## Version 0.2.0 — 23 septembre 2026

- Installateur NSIS final construit, installé et ouvert ; barre native supprimée, contrôles personnalisés testés (maximiser/restaurer), scrollbar et mascotte inspectées.
- Quatre vues Desktop sans violation axe WCAG 2 A/AA détectée.
- Parcours Desktop : dossiers validés, préférences enregistrées, étape de connexion atteinte, progression conservée. Parcours réinitialisé à l’accueil pour la livraison.
- Dossiers multiples et chemins avec espaces lus par le véritable parseur `utils.extra_config` de l’installation ComfyUI, dans un registre isolé. Test Node des métadonnées et aperçus des dossiers LoRA supplémentaires, avec refus de traversée.
- Vérification GitHub sans authentification contre le dépôt devenu public. Sélection des releases Studio testée séparément d’Android et des préversions ; refus des métadonnées sans empreinte.
- Cycle de mise à jour exercé avec un binaire de test annoncé 0.0.9 : détection de studio-v0.1.0, téléchargement public depuis GitHub, SHA-256 vérifié, arrêt des services, fermeture, installation NSIS et réouverture réelle de 0.1.0. La version finale 0.2.0 a ensuite été installée et son démarrage automatique des services vérifié.
- Certificat, clé privée et deux appairages inchangés octet pour octet après ce cycle.
- État final : ComfyUI sur 127.0.0.1:8188, compagnon HTTPS sur 0.0.0.0:8189, contrôle authentifié réussi. Les règles Windows existantes autorisent le Node installé de Mochi Studio.
- 40 tests Vitest, 25 tests Node/PowerShell, 4 tests Rust ; 48 scénarios navigateur existants et 2 scénarios onboarding supplémentaires réussis.
- Android 0.11.0 : APK ARM64 release construit et signé avec la clé existante ; parcours web mobile vérifié à 390 pixels, sans débordement horizontal ni violation axe détectée sur ses cinq étapes.

Limites : le contrôle mobile est celui du frontend dans Chromium, avec transport de connexion simulé et biométrie non prise en charge. Aucun téléphone n’est connecté ; ARTEMIS est bloqué par l’absence de clé fournisseur. Aucun test biométrique natif ou redémarrage physique de Windows pour cette livraison. Le lancement installé, le téléchargement et l’installation Windows sont réels. L’installateur reste sans certificat éditeur commercial.


## Version 0.2.1

L’adresse publique existante est exposée dans l’accueil et dans l’onboarding, avec export local/public, en réutilisant les appairages du PC. Le contrôle natif de 0.2.0 confirmait déjà les deux adresses ; le problème concernait leur visibilité hors de la page Connexion.

La page principale défile dans un conteneur situé sous la barre de fenêtre de 42 pixels. Contrôles à 860 × 640 : haut du conteneur à 42 px, aucun défilement du document, retour en haut après navigation ; trois pages sans violation axe WCAG 2 A/AA détectée. Export public présent dans l’étape de configuration. Aucune modification de certificat, d’appairage ou du réseau ; aucune vérification d’accès depuis Internet.
## Studio 0.2.2

- L’onboarding automatique n’apparaît qu’à la première ouverture ; il reste accessible dans les paramètres.
- L’ajout et le retrait de dossiers sont enregistrés immédiatement. « Appliquer et redémarrer le moteur » recharge les chemins dans ComfyUI, sans interrompre une file de génération active.
- Le lanceur classique réutilise le fichier persistant des dossiers supplémentaires.
- Option « Partager sur IP publique », adresse conservée et migration de l’appairage public existant. Le certificat doit couvrir l’adresse ; aucune rotation automatique d’identité.
- Icône Windows arrondie et expressions de Mochi selon l’état du moteur.

Validation : build TypeScript/Vite, 5 tests Rust, 40 tests Vitest et 25 tests Node/PowerShell. La joignabilité depuis Internet dépend toujours de la redirection du port et du pare-feu ; le bouton de partage ne configure pas le routeur.
Vérification Windows installée : sauvegarde puis fermeture/réouverture du lanceur, onboarding non répété, adresse publique conservée, dossier de test conservé puis retiré. Redémarrage réel via le bouton d’application ; services prêts, deux URL présentes, trois fichiers du dossier utilisateur listés par CheckpointLoaderSimple. Certificat et clé privés inchangés (SHA-256 comparés). Pas de nouvelle génération ni de test du téléphone/Internet dans cette validation.

## Studio 0.3.0 / Android 0.12.0

Ajout des téléchargements de modèles depuis Android : résolution Civitai .com/.red et Hugging Face, file PC persistante, téléchargement en flux, annulation, SHA-256, installation atomique sans écrasement et rafraîchissement automatique du catalogue. L’arrêt du moteur et l’installation d’une mise à jour Studio sont refusés pendant les imports actifs.

Validation fournisseur réelle : analyse de trois URL publiques (.com, .red, Hugging Face) ; téléchargement complet Hugging Face de 334 641 190 octets, SHA-256 `735e4c3a447a3255760d7f86845f09f937809baa529c17370d83e4c3758f3c75` ; accès aux deux endpoints de téléchargement Civitai jusqu’aux en-têtes HTTP 200 (sans télécharger 2 Go de checkpoint). Les téléchargements privés avec token et les conditions d’accès restreint sont traités, mais aucun compte fournisseur privé n’a été testé.

ARTEMIS : diagnostic bloqué faute de clé LLM dans son environnement ; l’émulateur initialement connecté n’était plus présent lors du second diagnostic. Pas de validation de cette version sur téléphone physique. Les scénarios web utilisent des réponses de compagnon simulées ; le téléchargement réel utilise le module du compagnon et un dossier isolé de validation.

Résultats finaux : 40 tests Vitest, 34 tests Node/PowerShell, 5 tests Rust Studio, 5 tests Rust Android/transport et le test TLS natif réel réussis. Les 52 scénarios Playwright passent, dont le suivi après fermeture de l’écran d’import, l’apparition automatique du LoRA et la conservation du prompt. APK ARM64 release signé (signature vérifiée), installeur Windows produit. Compagnon Windows installé : `/bridge/info` annonce `modelImports: true`, inspection Hugging Face via HTTPS authentifié réussie ; moteur et compagnon prêts. Certificat et clé identiques avant/après installation.

## Studio 0.3.1 / Android 0.12.1

- Illustrations Civitai de la version sélectionnée et miniatures Hugging Face récupérées sur le PC, validées et enregistrées avant actualisation du catalogue ; illustrations existantes conservées, échec d’image non bloquant.
- Chemins ComfyUI standard pris en compte pour les vignettes et métadonnées, en plus des dossiers partagés et supplémentaires.
- Diagnostic réel du défaut `NoneType.clone` : les modèles Anima installés n’embarquent ni encodeur de texte ni VAE. Identification par en-tête SafeTensors, workflow automatique avec Qwen 0.6B et VAE Qwen Image, prise en charge des dossiers de diffusion ; erreurs de dépendances présentées avant soumission.
- Les encodeurs et VAE autonomes Hugging Face ne sont plus exclus par le filtre des composants Diffusers.

Validation : 43 tests Vitest, 42 tests Node/PowerShell, quatre scénarios Playwright ciblés (génération, import et conservation du prompt, ancien compagnon, Anima et dépendances absentes). Les deux modèles réels `anima_aestheticV11.safetensors` et `oneObsessionAnima_v40.safetensors` ont produit une image chacun sur RTX 4070 SUPER, en 512 × 512 / 4 étapes, avec le constructeur de workflow de l’application. Il s’agit d’un test fonctionnel, pas d’un comparatif de qualité ou de performance. Leurs illustrations ont été récupérées réellement depuis Civitai. Les deux dépendances officielles Anima ont été installées depuis Hugging Face avec contrôle SHA-256.

Pas de nouveau test sur téléphone physique ; les vérifications UI de cette version sont réalisées dans le navigateur. Les restrictions d’accès propres aux comptes Civitai/Hugging Face restent celles du fournisseur.

Validation de la livraison installée : Studio 0.3.1 lancé, moteur et compagnon prêts. L’API HTTPS authentifiée détecte les deux modèles comme Anima, sert leurs illustrations JPEG et liste les deux dépendances. Certificat et clé privés identiques avant/après la mise à jour. Les cinq tests Rust Studio passent. Aucun réappairage nécessaire.
