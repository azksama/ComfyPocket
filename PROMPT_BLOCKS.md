# Prompts par blocs

Dans l’éditeur de prompt, **Texte** conserve l’édition libre et **Blocs** présente les sections sous forme de cartes. Les prompts positifs et négatifs ont chacun leurs sections.

- **Ajouter un bloc** crée une section nommée. Son nom est modifiable.
- La poignée permet de déplacer une section ; les flèches offrent le même contrôle sans glisser. Au clavier, la poignée accepte Haut, Bas, Début et Fin.
- Toucher son contenu ouvre l’éditeur avec autocomplétion Danbooru et traduction.
- **Texte libre** conserve les passages hors bloc dans une carte visuellement différente.
- Une section peut être retirée puis restaurée avec **Annuler**.
- Le bouton signet enregistre une section dans la bibliothèque. Insérer un bloc réutilisable ajoute désormais son titre avec son contenu.

## Format enregistré

Les sections sont conservées dans le texte existant, sans migration des anciens prompts :

```text
masterpiece,

## Body
red_dress, blue_eyes, white_hair,
##

## Background
beach, sunset,
##

soft light
```

`## Titre` ouvre un bloc ; le prochain titre commence une autre section. Une ligne `##` seule ferme le bloc et permet de reprendre le texte libre. Une ligne commençant par `#` est un commentaire. Les hashtags au milieu d’une ligne restent du texte ordinaire.

En mode de génération automatique, Mochi retire les lignes de commentaires des textes transmis aux encodeurs de ComfyUI. Cette compilation est effectuée par Mochi ; elle ne dépend pas d’un support natif des commentaires par le moteur. Pondérations, tags et ordre des sections sont conservés. Un prompt positif composé uniquement de commentaires est rejeté.

Les réglages enregistrés, presets, historique et métadonnées de génération conservent le texte source et ses titres. Un workflow API importé reste inchangé : ses nœuds et textes ne sont pas réécrits.

## Activer, convertir et pondérer

L’interrupteur de chaque bloc conserve son texte dans le document mais exclut son contenu du prompt final. Le format enregistré devient `## [off] Nom du bloc`. Réactiver le bloc restitue son contenu à la génération. Le contrôle des contradictions ignore aussi les blocs désactivés.

**Transformer en bloc** donne un nom à une section de texte libre sans modifier son contenu. La bibliothèque conserve titres et descriptions. Le bouton vocal est disponible dans l’éditeur principal et dans chaque bloc.

Le bouton **Poids du tag** agit sur le tag au curseur ou la sélection. Une intensité de 1 conserve le tag normal ; les autres valeurs utilisent `(tag:poids)`, sans imbriquer une pondération déjà présente. Les changements restent annulables.

## Assistant vocal et texte

Whisper et DanbotNL s’exécutent sur le PC via Mochi Studio 0.4. Les modèles sont téléchargés sur le PC depuis **Paramètres → Voix et modèles**, après action explicite. Le téléphone capture seulement le son. Une description peut également être saisie directement, sans microphone.

La dictée française est transcrite en anglais ; une description française saisie est traduite sur le PC. DanbotNL propose des tags que l’utilisateur peut modifier, sélectionner et insérer. La fermeture ou l’annulation ignore les réponses tardives et conserve le brouillon. La dictée est aussi disponible dans l’édition d’un bloc ; l’insertion y conserve le contenu sans ajouter de section imbriquée.

Le contrat `PromptOptimizer` reste utilisable pour d’autres moteurs : `optimize({ description, language, side }, signal)` renvoie `{ blocks: [{ title, text, side }] }`. Les propositions sont validées avant insertion. [Architecture, téléchargements et validation sur PC/émulateur](docs/ASSISTANT_PC.md).

## Validation

Les tests unitaires et navigateur couvrent format, ordre, activation, conversion, pondération, annulation, compilation ComfyUI, bibliothèque, brouillons et propositions. Des tests réels sur Primio Medium API 36.1 couvrent la connexion au compagnon, le tagging, le microphone et l’annulation. Les voix FR/EN synthétiques ont été traitées par Whisper Medium sur la RTX 4070 SUPER ; les voix naturelles restent à évaluer.
