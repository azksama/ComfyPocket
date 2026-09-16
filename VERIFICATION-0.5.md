# Vérification Comfy Pocket 0.5.0 — 16 septembre 2026

- 19 tests Vitest et 5 tests Node réussis : workflows, import, recherche par sous-chaîne, bibliothèque de prompts, validation des vignettes, métadonnées LoRA et protection des chemins.
- 25 parcours Playwright réussis, dont accessibilité et affichage mobile. Après les derniers ajustements, les 4 parcours touchant les nouveaux outils et l’autocomplétion ont été rejoués avec succès.
- Compilation TypeScript/Vite et Android ARM64 release signée avec la clé existante. Aucun changement des paramètres d’inférence du PC.
- Sur émulateur Android API 36.1 avec authentification par code système : délai de 30 secondes testé avant et après expiration, verrouillage immédiat, refus des commandes natives verrouillées, persistance du délai et verrouillage après arrêt/recréation du processus. Capture native des paramètres réussie avec la protection activée.
- Le module observe directement le cycle de vie de l’activité Android : les seuls callbacks du plugin Tauri ne déclenchaient pas le délai dans cette installation.
- Compagnon PC redémarré avec file d’attente vide. Vérification HTTPS authentifiée et certificat sur les adresses loopback, locale et publique depuis le PC. Lecture d’une fiche LoRA réelle depuis Stability Matrix validée.
- Limites : pas de téléphone physique ni de connexion mobile extérieure testés. Les scénarios d’interface utilisent un transport simulé. Le vérificateur de prompts repose sur des règles locales, pas sur une compréhension exhaustive du texte.

Les journaux et captures de cette livraison sont dans `outputs/verification/v0.5`, hors dépôt pour éviter d’y inclure des informations propres à l’installation.
