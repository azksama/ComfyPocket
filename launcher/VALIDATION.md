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
