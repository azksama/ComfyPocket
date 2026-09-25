# Assistant PC · Mochi 0.14 / Studio 0.4

La dictée et le tagging utilisent le PC appairé, via le même HTTPS et le même certificat que ComfyUI. Android enregistre seulement un extrait PCM mono 16 kHz de 60 secondes maximum, en mémoire. Une annulation ou le passage en arrière-plan ferme le microphone. Aucun poids Whisper/DanbotNL n'est embarqué dans l'APK ou téléchargé sur le téléphone.

## Première utilisation

1. Installer Mochi Studio 0.4 et démarrer le compagnon. Son dossier ComfyUI doit contenir `venv/Scripts/python.exe`, PyTorch, Transformers et SentencePiece.
2. Connecter Mochi Android au PC, puis ouvrir **Paramètres → Voix et modèles**.
3. Choisir Whisper Small, Medium ou Large v3 et télécharger les modèles sur le PC. Medium est le choix initial.
4. Dans l'éditeur de prompt ou d'un bloc, ouvrir **Assistant vocal**. Dicter en français/anglais, ou saisir une description. Les propositions sont modifiables et ne rejoignent le prompt qu'après validation.

Les paramètres et modèles sont conservés dans `ComfyPocketPC/assistant`, indépendamment du dossier d'installation de Studio. Une réinstallation de Studio ne les efface pas. Le téléchargement initial nécessite Internet ; l'inférence reste locale au PC. Les dépendances de ComfyUI ne sont pas installées ou remplacées automatiquement.

| Téléchargement | Dépôt | Taille approximative |
| --- | --- | --- |
| Whisper Small | `openai/whisper-small` | 971 Mo |
| Whisper Medium | `openai/whisper-medium` | 3 060 Mo |
| Whisper Large v3 | `openai/whisper-large-v3` | 3 092 Mo |
| DanbotNL | `dartags/DanbotNL-2408-260M` | 534 Mo |
| Traduction du texte français, incluse avec DanbotNL | `Helsinki-NLP/opus-mt-fr-en` | 304 Mo |

Whisper traduit la dictée française vers l'anglais. Le texte français saisi utilise le modèle de traduction avant DanbotNL. DanbotNL produit des tags ; il peut omettre ou ajouter des notions. L'écran de validation permet de corriger ses propositions avant insertion. Il ne remplace pas un contrôle humain de leur pertinence.

## Exécution

Le compagnon lance un processus Python court par demande, sans port supplémentaire. Les modèles sont libérés à la fin du processus. Le mode automatique utilise CUDA si disponible et si la mémoire libre est suffisante, sinon le CPU. Les options GPU NVIDIA et CPU permettent un choix explicite. Un seul téléchargement ou traitement de l'assistant est accepté à la fois. La mémoire nécessaire varie avec le modèle et ComfyUI ; un problème d'inférence conserve le brouillon.

`bridge/assistant-models.json` fixe les dépôts, révisions, fichiers, tailles et empreintes. Le téléchargement vérifie SHA-256 pour les objets LFS et les empreintes Git des petits fichiers. L'inférence recontrôle les fichiers et interdit les téléchargements implicites. Les trois modules Python personnalisés de DanbotNL sont ceux de la révision épinglée, relus avant intégration ; aucun dépôt ou script arbitraire ne peut être fourni par le client.

Les tâches ont des identifiants aléatoires, une durée maximale et une annulation. Les extraits audio ne sont pas écrits sur disque. Les propositions conservées temporairement dans le processus du compagnon expirent au bout de quinze minutes. Aucun texte ou audio n'est envoyé à Hugging Face pour l'inférence.

## Validation de cette version

- PC : RTX 4070 SUPER 12 Go, PyTorch 2.14.0+cu130 et Transformers 5.17.0.
- Whisper Medium : deux échantillons vocaux synthétiques FR/EN de description d'image, transcriptions anglaises correctes, environ 10 secondes par demande en incluant le chargement et la vérification des fichiers.
- DanbotNL : inférence CUDA depuis du texte anglais et depuis un texte français traduit ; normalisation des tags individuels et suppression des balises du modèle.
- Android : Primio Medium API 36.1, connexion réelle au compagnon, propositions de tags, demande d'autorisation microphone, enregistrement et annulation. Le test reproductible `node tests/android-assistant.mjs emulator-5554` exige une APK debug et un PC de test déjà appairé avec les modèles installés.
- La qualité sur des voix naturelles, les accents variés et les réseaux mobiles reste à mesurer ; les essais synthétiques ne prouvent pas ces cas.

## Licences des modèles

- Whisper (poids Hugging Face utilisés) : Apache-2.0, https://huggingface.co/openai/whisper-medium
- DanbotNL : Apache-2.0, https://huggingface.co/dartags/DanbotNL-2408-260M
- OPUS-MT français–anglais : Apache-2.0, https://huggingface.co/Helsinki-NLP/opus-mt-fr-en

Les poids sont obtenus à la demande depuis ces dépôts, séparément des binaires Mochi.
