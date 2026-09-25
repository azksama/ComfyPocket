# Validation Mochi 0.14.0 et Studio 0.4.0

## Vérifications exécutées

- 53 tests Vitest et 44 tests Node/PowerShell réussis.
- Rust Android : 5 tests réussis ; un test TLS nécessitant une configuration externe ignoré.
- Navigateur : 62 scénarios couverts ; 60 réussis au premier passage, les deux assertions devenues obsolètes corrigées et les 10 scénarios concernés/reliés repassés avec succès.
- APK Android arm64 release : compilation, optimisation R8 et lint vital réussis, version 0.14.0 / code 14000, signature de production conservée. Aucun poids de modèle embarqué.
- Studio Windows x64 : compilation de l'installateur 0.4.0 réussie, compagnon et manifeste des modèles inclus.
- Primio Medium API 36.1 : connexion HTTPS réelle au compagnon et inférence DanbotNL depuis le texte français ; autorisation microphone, enregistrement et annulation vérifiés. Le script `tests/android-assistant.mjs` a été exécuté avec succès.
- Mise à jour Android : une APK de test marquée 0.12.9 et signée avec la même clé a détecté la release GitHub 0.13.0, téléchargé et vérifié l'APK, demandé l'autorisation d'installation puis ouvert l'installateur Android. Après contrôle Play Protect, installation effective confirmée par Android et `versionCode=13000`. Cette APK intermédiaire n'est pas publiée.
- Whisper Medium CUDA : deux échantillons synthétiques FR/EN traduits/transcrits correctement en anglais, environ 10 secondes par demande incluant chargement et vérification des fichiers.
- DanbotNL CUDA : texte anglais et texte français traduit, tags individuels normalisés, propositions soumises à validation.

## Limites

Les essais sur émulateur et les échantillons synthétiques ne mesurent pas la qualité sur voix naturelles, les accents variés ou les réseaux mobiles. DanbotNL peut produire des tags superflus ou manquer des attributs : les propositions restent éditables et requièrent une validation. Les dépendances Python doivent être présentes dans l'environnement ComfyUI du PC ; Mochi ne remplace pas automatiquement ses bibliothèques.
