# Comfy Pocket 0.5.0

Client Android privé de ComfyUI, avec les modèles et le GPU du PC. Interface claire bleu/lilas, adaptée aux téléphones et aux grands écrans.

Depuis un clone Git, les lanceurs `Demarrer-ComfyPocket.cmd` et `Demarrer-ComfyPocket.ps1` sont disponibles directement à la racine du dépôt. Les fichiers d'appairage et les clés de signature Android sont locaux et ne sont pas versionnés. Les instructions d'installation ci-dessous décrivent également la livraison regroupée dans le dossier `outputs`.

## Installation et mise à jour

1. Installer **ComfyPocket-arm64.apk** sur Android 10 ou ultérieur. Il est signé avec la même clé que la version 0.1 : installer par-dessus conserve les données.
2. Garder le dossier **ComfyPocket**, **Demarrer-ComfyPocket.ps1** et **Demarrer-ComfyPocket.cmd** ensemble. Après démarrage du PC, double-cliquer sur **Demarrer-ComfyPocket.cmd** et attendre **PRET** (ComfyUI peut prendre jusqu'à trois minutes à s'initialiser). Le lanceur vérifie le certificat, l'authentification HTTPS et la disponibilité du moteur avant de confirmer la connexion. **La fenêtre peut ensuite être fermée : les deux services continuent en arrière-plan.** Un second lancement réutilise les services ; les démarrages simultanés sont protégés contre les doublons. Les journaux se trouvent dans `%LOCALAPPDATA%\ComfyPocketPC`.
3. Dans l'onglet **Paramètres** (roue dentée tout à droite), importer **Appairage-PC-local-v0.3.json** pour le Wi-Fi local ou **Appairage-PC-public.json** pour l'adresse publique, nommer le profil et toucher **Connecter mon PC**.
4. Les profils fonctionnels de la version 0.3 restent valides en 0.5, sans réappairage. Pour une version plus ancienne, importer l'un de ces fichiers au certificat corrigé. Les anciens fichiers Appairage-PC.json et Appairage-PC-local.json ont été conservés, mais leur certificat est périmé pour cette installation.

Le compagnon écoute sur **0.0.0.0:8189** : localhost et interfaces du PC. Adresse locale : **https://192.168.1.8:8189** ; adresse publique : **https://82.67.151.59:8189**, via la redirection de port de la box. ComfyUI reste sur **127.0.0.1:8188**. WireGuard peut aussi transporter l'accès à l'adresse locale du PC.

Le fichier d'appairage contient une clé privée d'accès au serveur. Ne pas le publier. Il n'est pas inclus dans l'archive des sources. Modifier seulement une adresse ne réémet pas le certificat : l'adresse doit figurer dans ses SAN.

Le lanceur emploie l'option ComfyUI `--disable-dynamic-vram`, si elle existe, pour éviter le blocage natif aimdo/WDDM constaté sur ce PC pendant les tests. Les fichiers de modèles et la configuration Stability Matrix ne sont pas modifiés. Si un autre ComfyUI tourne déjà et répond, il est réutilisé.

Le profil PC vérifié le 13 septembre 2026 ajoute explicitement `--use-pytorch-cross-attention --reserve-vram 0.9`, conformément aux réglages enregistrés dans Stability Matrix, et garde `--preview-method auto`. Sur la RTX 4070 SUPER 12 Go, cinq générations SDXL 1024 × 1024 à 30 étapes ont pris 8,50 à 8,55 s après chargement du modèle. Avec le même amorçage, les comparaisons à seed identique retrouvent les mêmes pixels que la référence ; la première génération à froid peut différer légèrement. Ces chiffres mesurent le moteur, hors transfert réseau et affichage Android. Les autres variantes testées (highvram, channels last, sans aperçu, mémoire dynamique et transferts synchrones) n'ont pas établi de gain supplémentaire fiable sur ce PC. Aucun changement de précision, de modèle, de résolution ou d'étapes. Les nouveaux arguments s'appliquent au prochain lancement de ComfyUI par ce script ; un moteur déjà ouvert conserve ses arguments.

L'accès public a été vérifié depuis ce PC (bouclage NAT), et la connexion native depuis un émulateur Android. Le test sur un téléphone physique hors du domicile reste à effectuer.

## Nouveautés 0.5

- Presets avec une vignette JPEG de l’image source affichée ou importée, conservée sur l’appareil. Les anciens presets restent lisibles.
- Recherche Danbooru par sous-chaîne : correspondance exacte en premier, puis tags contenant le terme classés par popularité, même si un autre mot le précède.
- Éditeur : historique local de 100 versions, dédoublonné, et blocs nommés réutilisables avec positif et négatif, modifiables et supprimables.
- Vérificateur local : tags identiques dans les deux prompts, synonymes connus et oppositions courantes. Les avertissements ne bloquent pas la génération et ne constituent pas une analyse sémantique exhaustive.
- Fiches LoRA depuis les fichiers locaux `.cm-info.json`, `.civitai.info` ou `.json` : aperçu, version, modèle de base, description, mots déclencheurs à insérer et notes personnelles sur l’appareil. Redémarrer le compagnon pour charger le nouvel endpoint.
- Galerie : glisser vers le haut pour l’image suivante, vers le bas pour la précédente ; à gauche pour la corbeille récupérable, à droite pour les favoris. Les gestes sont désactivés pendant le zoom.
- Délai de verrouillage natif configurable et captures d’écran autorisées.

## Interface

- Titres simples **Atelier, Galerie, Glossaire, Paramètres**. Les messages deviennent des notifications temporaires superposées, sans déplacer le contenu. Le chargement de la galerie conserve sa grille en place.
- Vues conservées pendant les glissements et animations sur un rail commun ; formulaires et cartes ouvertes gardent leur état. Espacement identique autour des cercles aux extrémités du menu. Les cartes restent blanches à l'appui.
- Dans l'atelier : modèle et réglages associés, puis LoRA, puis prompts.
- Toucher **PC connecté** affiche l'adresse, le port, l'état et les valeurs de RAM/VRAM libres remontées par ComfyUI, actualisées tant que le panneau est ouvert.
- Menu flottant arrondi, icônes seules : **Créer, Galerie, Glossaire, Paramètres**. Les noms restent disponibles aux lecteurs d'écran. Glisser horizontalement pour changer de page.
- Éléments directement sur le fond sans contour, ombres légères, couleurs bleu/lilas.
- Cartes de **Créer** fermées par défaut et repliables séparément. Le rendu s'ouvre lorsqu'une génération ou une image importée arrive.
- Galerie configurable en **2, 3 ou 4 colonnes**, avec choix mémorisé.

## Éditeur de prompts et glossaire

Toucher **Votre idée** ou **Prompt négatif** ouvre un éditeur plein écran à deux onglets. Les suggestions Danbooru apparaissent dans une bulle sous le texte au curseur ; toucher un tag le complète et ajoute **une virgule suivie d'une espace**, sans doubler une virgule existante. Le cadre de la bulle reste en place pendant la saisie. Un interrupteur mémorisé permet de désactiver l'autocomplétion. Annuler/rétablir, poids entre parenthèses, sélection au clavier et composition du clavier Android sont pris en charge.

L'index local contient **234 011 tags uniques** issus du CSV fourni, convertis en TSV trié et compressé, chargé dans un worker. Aucun service d'autocomplétion externe. La ponctuation des tags est préservée par le compilateur ; le CSV d'origine n'est pas modifié.

Le glossaire reprend les noms et sous-catégories de [Making Images Great Again](https://making-images-great-again-library.vercel.app/) et son [catalogue source](https://raw.githubusercontent.com/A13JM/MakingImagesGreatAgain_Library/refs/heads/main/tag_groups_and_lists_output.json), avec recherche et ajout de plusieurs tags au positif ou au négatif. **90 catégories, 438 rubriques et 6 665 tags uniques** restent après filtrage. Les groupes de personnages et franchises, les tags classés personnages/séries dans le CSV et leurs variantes identifiables sont exclus. Les tags absents du CSV sont omis pour éviter de les classer arbitrairement. Ce filtre concerne le glossaire ; l'autocomplétion conserve le CSV complet.

## Presets et favoris de modèles

**Mes presets** ouvre une page complète. **Nouveau preset** ouvre un formulaire séparé avec titre et bouton **Enregistrer**. Tous les réglages d'inférence sont mémorisés : prompts, modèle, LoRA et poids, sampler, scheduler, dimensions, seed, lots, VAE, Clip skip, Hires Fix, upscaler et workflow API validé si ce mode est actif. Charger un preset remplit ces paramètres. Renommage, recherche, suppression récupérable et import JSON disponibles. L'annulation de suppression apparaît en bas, à distance de la recherche. Ces presets sont conservés sur l'appareil, sans identifiants de connexion.

Les cœurs des sélecteurs de modèles et LoRA mémorisent les favoris sur le PC ; le filtre **Favoris** les retrouve. Les upscalers entraînés du PC apparaissent dans les deux sélecteurs d'agrandissement, y compris avec les schémas COMBO récents de ComfyUI.

Sur cette installation, **4x-UltraSharp.pth est un fichier HTML de 2 063 octets**, pas des poids utilisables. Il faut le remplacer par un téléchargement valide pour l'exécuter. Les fichiers originaux ont été préservés ; **4x-UltraMix_Balanced.pth** a été validé avec une vraie génération GPU.

## Verrouillage Android

Dans **Paramètres → Accès à l'application**, activer le verrouillage biométrique. Android demande l'empreinte, un visage compatible ou le code système. Activer et désactiver la protection exige cette authentification. Au nouveau démarrage, l’accès est toujours verrouillé. En arrière-plan, choisir un délai immédiat, de 30 secondes, 1 minute, 5 minutes ou 15 minutes. Annuler la demande laisse l'app verrouillée. Les commandes natives de connexion, fichiers et API refusent l'accès verrouillé. Les captures d’écran sont autorisées. Le masquage des aperçus récents est configurable à partir d’Android 13, ainsi que la demande automatique de biométrie au démarrage.

Configurer d'abord une méthode de verrouillage dans Android. Les données biométriques restent gérées par le système. Les icônes Android carrées et rondes fournies sont copiées sans retouche aux cinq densités ; l'image Play Store originale est conservée dans assets/android-icons.

## Connexions

- Enregistrer plusieurs profils, pour plusieurs PC ou plusieurs adresses d’un même PC.
- Modifier le nom, l’adresse HTTPS, la clé et le certificat depuis le bouton crayon.
- Enregistrer un profil sans que le PC soit allumé, puis se connecter plus tard.
- Un changement du profil actif demande une nouvelle connexion.
- Déconnecter conserve les profils. Supprimer un profil le retire de cet appareil.
- L’ancien appairage unique est repris et migré lors du premier enregistrement.
- Les clés restent dans les fichiers privés de l’application native ; la sauvegarde Android est désactivée. Elles ne passent pas par le stockage web.

Le PC conserve ses générations lorsque l’on change de profil. Les tâches suivies et les réglages sont mémorisés par adresse de serveur.

## Création

Le rendu et son aperçu apparaissent en haut. Le mode **Automatique** construit un workflow pour les checkpoints SD 1.x, SD 2 et SDXL. Les architectures séparant modèles de diffusion et encodeurs, ainsi que les nœuds spécifiques, utilisent **Workflow API**.

Réglages : modèle illustré, prompts positif et négatif, LoRA/LyCORIS avec poids, sampler, scheduler, steps, CFG, VAE et Clip skip. Les choix proviennent de l’instance ComfyUI.

Dimensions personnalisées de 64 à 4 096 pixels, multiples de 8. Inversion largeur/hauteur, formats prédéfinis et dix formats personnels mémorisables.

**Hires Fix** : agrandissement latent ou avec un modèle d’upscale du PC, deuxième échantillonnage, facteur, steps et débruitage. Les LoRA, VAE et Clip skip s’appliquent aux deux passes. **Upscaler** ajoute un agrandissement après le décodage final, avec interpolation ou modèle entraîné.

**Batch size** indique le nombre d’images par lot. **Batches** indique le nombre de lots envoyés séparément. Une seed fixe augmente de 1 entre les lots ; une seed vide est tirée aléatoirement pour chaque lot. Les seeds sont conservées sans arrondi jusqu’à 18446744073709551615. Le bouton de la dernière seed la remet dans le champ.

Une grande résolution, plusieurs images simultanées ou Hires Fix peuvent dépasser la VRAM. Les erreurs du moteur s’affichent dans l’app. L’annulation vise uniquement les lots suivis par cette application.

## Métadonnées et réutilisation

**Paramètres depuis une image** lit un PNG ou JPEG choisi sur le téléphone. **Réutiliser les paramètres** dans le lecteur de la galerie fait la même chose avec l’original du PC. L’image est affichée en tête de la création, et sa seed ainsi que les réglages reconnus remplissent le formulaire.

Formats reconnus :
- PNG : paramètres Comfy Pocket, graphe ComfyUI prompt, Stability Matrix parameters-json, texte A1111 parameters ou user_comment.
- Blocs PNG tEXt, zTXt et iTXt, avec ou sans compression.
- JPEG : EXIF UserComment, ImageDescription ou XPComment, notamment les commentaires Unicode de génération.

Un fichier sans métadonnées ne permet pas de retrouver sa seed. Les modèles absents sont signalés, sans remplacement silencieux lors de l’import. Les nœuds personnalisés ne sont pas tous traduisibles en champs : le **workflow API original** reste disponible lorsqu’il est présent. Le mode API utilise son propre graphe ; modifier les champs automatiques ne le modifie pas.

Les PNG créés en mode automatique contiennent les réglages complets. Pour un batch de plusieurs images, la seed décrit le lot complet ; retrouver cette seed ne signifie pas pouvoir isoler chaque image comme une génération unitaire identique. L’enregistrement conserve les octets et les métadonnées de l’original.

Cette réutilisation charge les paramètres de génération, pas une transformation img2img.

## Galerie

Images des dossiers ComfyUI et Stability Matrix, dédoublonnées, recherchables et paginées. Le compagnon calcule des vignettes de 480 pixels ; le lecteur récupère l’original.

- Toucher une image : plein écran, image entière.
- Glisser haut/bas : image suivante/précédente.
- Glisser vers la gauche : déplacer dans la corbeille.
- Glisser vers la droite : mettre en favori.
- Pendant un glissement horizontal, une icône indique l'action avant de relâcher. Les images voisines sont décodées à l'avance et conservées pendant la transition pour éviter le flash de l'image précédente.
- Appui long sur une vignette : sélectionner plusieurs images pour les mettre en favori, les télécharger ou les déplacer dans la corbeille. Le bouton **Sélectionner** offre aussi cette action au clavier. Les téléchargements sont traités un par un ; en cas d'échec partiel, seules les images en échec restent sélectionnées pour réessayer.
- Quatre boutons circulaires à droite : favori, téléchargement, paramètres, corbeille. Fermeture en haut, sans boutons précédent/suivant ni indications de gestes. Flèches du clavier et Échap disponibles.
- Écarter deux doigts pour zoomer, puis déplacer l’image. Double toucher pour revenir à la vue entière quand elle est zoomée. Les gestes de suppression sont désactivés pendant le zoom. Transitions horizontales/verticales et préchargement des voisines.
- **Enregistrer** copie l’original dans Photos / ComfyPocket via Android MediaStore.
- Favoris conservés sur le PC, partagés entre les profils qui s’y connectent.
- **Corbeille** et **Annuler la suppression** permettent une restauration. Aucun effacement définitif automatique. Une restauration refuse d’écraser un fichier existant.

Les images supprimées restent dans .comfy-pocket-trash sous leur dossier de sortie, avec un journal de restauration. Les favoris sont dans library.json à côté de la configuration du compagnon.

Les illustrations des modèles sont cherchées à côté des fichiers dans E:/Stability/Data/Models : nom.preview.jpeg, .jpg, .png ou .webp, dans StableDiffusion, Lora et LyCORIS. Les modèles sans illustration gardent un emplacement neutre.

## Développement et vérification

Node.js 22.12+ ou 24, Rust, JDK 17+, SDK Android et NDK r27+. Installer les dépendances avec npm ci.

- npm test : workflows, imports de métadonnées, HTTPS, chemins de fichiers, favoris, corbeille, vignettes.
- npm run test:e2e : interface avec transport simulé, gestes, profils, dimensions, lots et accessibilité à 320/390/1440 pixels.
- npm run build : contrôle TypeScript et bundle Vite.
- cargo test --lib dans src-tauri : validation native des adresses ; le test TLS réel exige COMFY_PAIRING_FILE et l’option --ignored.
- node scripts/ui-live-check.mjs <appairage> <dossier-preuves> : véritable HTTPS et véritable génération GPU à travers l’interface web. L’adaptateur de commandes natives de ce test n’est pas un service web public.
- scripts/build-android.ps1 -Target aarch64 -Release : nécessite NDK_HOME, COMFY_KEYSTORE, COMFY_STORE_PASSWORD. Le contournement Windows copie la bibliothèque Rust réellement compilée lorsqu’un lien symbolique est interdit.
- node scripts/package-source.mjs : archive les sources sans clés, dépendances ou binaires intermédiaires.

Le compagnon écoute en HTTPS, exige une clé d’accès et rejette les origines navigateur. ComfyUI reste lié à 127.0.0.1. Le client natif vérifie le certificat du PC et l’adresse du serveur. Aucun abonnement ou service de génération cloud n’est nécessaire.

Les preuves de livraison et les captures sont dans verification/v0.5 à côté du projet. Les tests d'interface utilisent un transport simulé ; le scénario live utilise réellement le compagnon HTTPS et le GPU. La validation sur émulateur est distincte d'un essai sur téléphone physique.
