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
