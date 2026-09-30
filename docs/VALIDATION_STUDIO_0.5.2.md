# Mochi Studio 0.5.2

## Cause et correction

L'installation Windows et les processus lancés par l'environnement de développement voyaient deux contenus différents à la même adresse `%LOCALAPPDATA%\ComfyPocketPC`. Une lecture hors du contexte du lanceur a confirmé un ancien certificat sans l'adresse publique et le partage désactivé, tandis que la configuration de développement contenait le certificat fonctionnel et le partage activé. Les contrôles précédents effectués uniquement depuis ce dernier contexte ne validaient donc pas le démarrage habituel de l'utilisateur.

Studio utilise maintenant `%USERPROFILE%\.mochi\pc`, commun aux deux contextes. Au premier lancement, une copie complète des anciennes données est publiée après migration ; les anciennes données ne sont ni supprimées ni réimportées au démarrage suivant. Une migration incomplète ne publie pas de dossier partiel. Le CLI et les scripts PowerShell utilisent le même emplacement dès qu'il existe.

Sur ce PC, la configuration fonctionnelle existante a été reprise dans ce dossier commun et les deux anciennes copies ont été sauvegardées hors du dépôt. Le certificat, sa clé et le jeton n'ont pas été régénérés. L'empreinte SHA-256 du fichier de certificat reste `32c98f3c2fe1938a6c850a7c0abb62109c93c040493d200b3f509ea179478227`. Aucun contournement de la validation TLS n'est ajouté.

Quand un lanceur supervise ses enfants dans un groupe de processus Windows, Studio se relance via WMI hors de ce groupe avant d'initialiser Tauri. Il conserve les arguments reçus et interrompt la boucle avec une erreur explicite si Windows ne permet pas le détachement.

## Livraison et installation

- Installateur NSIS `Mochi-Studio-0.5.2-Windows-x64.exe` avec Node, le compagnon et ses dépendances.
- Archive `Mochi-Studio-0.5.2-Portable-Windows-x64.zip`, à extraire entièrement. L'exécutable et son dossier `runtime` restent ensemble.
- Les versions installée et portable retrouvent les mêmes réglages sur un PC. ComfyUI, Python, les pilotes et les modèles restent dans l'installation existante ; ils ne sont pas inclus dans ces distributions.
- Aucun certificat privé, jeton, appairage ou réglage personnel n'est inclus dans les distributions publiques.

## Vérifications effectuées le 30 septembre 2026

- 12 tests Rust réussis, dont migration complète, conservation de l'identité, refus de migration partielle et échappement des arguments Windows.
- 54 tests Vitest et 48 tests Node/PowerShell réussis.
- Régression Playwright Studio réussie : onboarding masqué après rechargement et réglage public éditable et persistant.
- Test d'indépendance Windows réussi avec le module de production : démarrage dans un groupe `KILL_ON_JOB_CLOSE`, relancement hors du groupe, fermeture du groupe et survie du processus indépendant.
- Compilation TypeScript/Vite, application Rust et installateur NSIS réussies.
- Installation réelle dans `C:\Users\AZK\Apps\MochiStudio` : code de sortie NSIS 0, version 0.5.2, runtime inclus, raccourcis bureau/menu Démarrer et désinstallation enregistrés.
- Ouverture de la version installée et clic sur **Démarrer le moteur** via l'interface Windows : services connectés, pas d'onboarding ni d'erreur de certificat. Réglages repris : ComfyUI et bibliothèque Stability Matrix, dossier supplémentaire de checkpoints, attention PyTorch, réserve VRAM 0,9 Go, aperçus automatiques, partage public et port 8189.
- Processus installé réellement relancé via WMI avec `--mochi-independent`, hors du groupe de son lanceur. Le compagnon Node fonctionne également hors de ce groupe.
- Connexion HTTPS authentifiée à l'adresse locale et à l'adresse publique depuis le PC : `/bridge/info` et `/api/system_stats` renvoient HTTP 200, avec contrôle du certificat et de l'adresse. GPU remonté : RTX 4070 SUPER.
- Fermeture complète du processus Studio : les deux adresses et ComfyUI continuent de répondre.
- Extraction de l'archive portable dans un nouveau dossier puis ouverture de son exécutable : version 0.5.2, mêmes adresses, état connecté, onboarding toujours masqué et certificat inchangé.
- Retour à la version installée via son raccourci, avec les services toujours actifs. Contrôle HTTPS répété dans un processus Windows WMI extérieur au contexte du lanceur : mêmes données et quatre réponses HTTP 200.
- Contrôle des sources et du contenu extrait de la version portable : aucun jeton ni fragment des clés privées des deux anciennes identités. Empreintes SHA-256 des trois distributions générées pour la release.

La fermeture réelle de ChatGPT n'a pas été exécutée pendant cette session ; son effet de fermeture de groupe de processus a été reproduit dans le test Windows. Aucun redémarrage complet du PC, téléphone physique ni accès 4G/5G n'a été testé dans cette livraison. La vérification publique depuis le PC valide le bouclage réseau, pas un accès mobile extérieur.
