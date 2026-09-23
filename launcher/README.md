# Mochi Studio

Lanceur Windows en Rust + Tauri pour l’installation ComfyUI utilisée par Mochi.

## Utilisation

Installez `Mochi-Studio-0.2.0-Windows-x64.exe`, puis ouvrez **Mochi Studio**.
Le lanceur reprend `%LOCALAPPDATA%\ComfyPocketPC` : certificat, appairages et configuration existants.
Dans **Paramètres**, sélectionnez votre dossier ComfyUI (avec `main.py` et `venv\Scripts\python.exe`) et votre bibliothèque de modèles. Cliquez sur **Démarrer le moteur**.

- État réel du moteur et du compagnon, GPU, VRAM et file d’attente.
- Arrêt protégé si des images sont en cours ou en attente.
- Réserve VRAM, méthode d’attention, aperçus, gestion VRAM, port et écoute réseau.
- Démarrage du lanceur avec Windows et démarrage du moteur à son ouverture, désactivés par défaut.
- Fermeture vers la zone de notification ; quitter le lanceur conserve les services.
- Export privé des appairages, ouverture de la configuration et journaux bornés avec masquage de la clé.
- Bouton **Autoriser le réseau dans Windows** : autorisation administrateur Windows pour une règle limitée au runtime du compagnon et à son port. ComfyUI reste sur l’interface locale.

Les paramètres du moteur nécessitent un arrêt puis un démarrage. Après un changement de port, réimportez l’appairage côté téléphone et adaptez votre routeur. L’état connecté confirme les services depuis le PC ; il ne prouve pas la connectivité du téléphone.

Node et les dépendances du compagnon sont inclus dans l’installateur. ComfyUI, Python, les modèles et les pilotes GPU restent ceux de votre installation existante. Aucun téléchargement de modèles ni changement de précision n’est effectué. Les clés ne sont jamais incluses dans l’installateur.

## Développement

Depuis la racine du dépôt :

```powershell
npm ci
node scripts/prepare-studio.mjs
npm run tauri --prefix launcher -- dev
```

Compilation Windows :

```powershell
node scripts/prepare-studio.mjs
npm run tauri --prefix launcher -- build
```

Installateur : `launcher/src-tauri/target/release/bundle/nsis/`.
Le runtime généré est ignoré par Git et par l’archive des sources. `Cargo.lock` fixe les dépendances Rust ; les dépendances UI utilisent le lockfile du dépôt parent.

Les rendus `design/clmx1.png` et `design/zV3N2.png` proviennent de pen.dev. Les données de maquette (`?design=1`) sont disponibles uniquement dans le serveur de développement, jamais dans la compilation de production.

Vérifications : `cargo test --manifest-path launcher/src-tauri/Cargo.toml`, `node --test scripts/launcher.test.mjs scripts/studio.test.mjs`, `npm run build --prefix launcher`.

## Nouveautés 0.2.0

La fenêtre utilise les couleurs Mochi, une barre de titre personnalisée et des scrollbars pastel. La fermeture peut masquer le lanceur près de l’horloge ou le quitter ; les services continuent dans les deux cas.

Le parcours de configuration reprend l’étape interrompue et se relance depuis Paramètres. Il accompagne le choix des dossiers, le démarrage automatique, l’accès réseau et l’export d’appairage. ComfyUI doit déjà être installé ; le lanceur ne télécharge ni Python ni les modèles.

Les dossiers supplémentaires acceptent plusieurs emplacements par catégorie : checkpoints, LoRA, VAE, ControlNet, upscale, embeddings, encodeurs de texte et modèles de diffusion. Ils sont transmis via `studio-model-paths.yaml` et `--extra-model-paths-config`, sans modifier les fichiers de configuration de ComfyUI. La bibliothèque du compagnon utilise également ces emplacements pour les aperçus et fiches. Redémarrez les services après modification.

La recherche de mises à jour interroge les releases publiques de `azksama/ComfyPocket` et sélectionne uniquement les tags stables `studio-v*`. Le téléchargement attend un installateur `Mochi-Studio-VERSION-Windows-x64.exe`, vérifie sa taille et l’empreinte SHA-256 retournée par GitHub, puis lance NSIS. Aucune clé GitHub n’est requise. L’installation refuse les générations en cours et ne touche pas à l’appairage. Un moteur prêt avant la mise à jour est relancé ensuite. Les échecs NSIS sont enregistrés dans `%LOCALAPPDATA%\ComfyPocketPC\updates\install-error.log`.

La réduction des animations, la recherche automatique des mises à jour, le comportement de fermeture et les options de démarrage restent modifiables dans Paramètres. Les mises à jour demandent toujours un clic sur Télécharger et installer.
