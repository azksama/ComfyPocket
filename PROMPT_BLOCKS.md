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

## Assistant vocal : préparation de l’intégration

L’entrée **Assistant vocal** permet aujourd’hui de rédiger une description française ou anglaise, conservée localement sur l’appareil. Aucun enregistrement audio, appel réseau ou génération de tags n’est effectué sans modèle connecté. Les actions indisponibles sont désactivées et l’interface indique **En attente du modèle**.

`src/promptOptimizer.ts` définit le contrat à implémenter lorsque le modèle sera prêt :

- `dictate(language, signal)` est facultatif et retourne une transcription. L’adaptateur devra gérer permission microphone, capture, arrêt et libération des ressources.
- `optimize({ description, language, side }, signal)` retourne `{ blocks: [{ title, text, side }] }`. `side` vaut `positive` ou `negative`.
- `signal` permet d’annuler à la fermeture ou via le bouton Annuler. Les réponses tardives après annulation sont ignorées.
- Les réponses sont validées : 1 à 20 blocs, 20 000 caractères de texte par bloc, 80 000 au total. Les titres sont normalisés sur 80 caractères.

Le composant `PromptAssistant` accepte cet adaptateur via sa prop `adapter`. Aucun adaptateur de production n’est livré dans cette version ; son branchement dans `PromptEditor` dépendra du choix du modèle, de son hébergement et de son protocole.

Le parcours de revue est préparé : modifier noms/tags/destination, décocher les propositions indésirables, puis insérer explicitement les blocs sélectionnés. L’insertion conserve les prompts existants. Une erreur laisse la description disponible pour réessayer.

## Validation

Les tests unitaires couvrent le format, le réordonnancement, les commentaires, la compilation ComfyUI et le contrat des propositions. Les tests navigateur couvrent édition, glisser-déposer, annulation, bibliothèque, persistance, charge utile de génération et brouillon vocal sans modèle. Ils ne remplacent pas une validation tactile sur un appareil Android physique ni la validation du futur modèle.
