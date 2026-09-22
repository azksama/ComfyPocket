# Mochi Studio

Lanceur Windows en Rust + Tauri pour l’installation ComfyUI utilisée par Mochi.

## Utilisation

Installez `Mochi Studio_0.1.0_x64-setup.exe`, puis ouvrez **Mochi Studio**.
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
