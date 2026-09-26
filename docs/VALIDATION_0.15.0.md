# Audit et validation Mochi 0.15.0 / Studio 0.5.0

## Constats et corrections

Le 26 septembre 2026, ComfyUI répondait sur son port local, mais aucun compagnon n’écoutait sur le port du téléphone. Relancer le compagnon installé a rétabli la connexion HTTPS authentifiée et l’accès au moteur, sans remplacer le certificat ni interrompre ComfyUI. Studio 0.5.0 récupère désormais ce cas au lancement, puis toutes les trente secondes tant que le lanceur reste ouvert et que la connexion du téléphone est activée. La demande `--start-engine` est également traitée quand Studio est déjà ouvert.

L’interrupteur de partage public était désactivé lorsque l’adresse était vide. Il reste maintenant utilisable : activation, saisie ou détection de l’IP, puis sauvegarde explicite. L’adresse est contrôlée contre le certificat existant. Le logiciel n’ouvre pas automatiquement de redirection sur le routeur.

L’onboarding pouvait être réintroduit par une copie obsolète des réglages côté interface. Son état est maintenant conservé côté Rust lors des sauvegardes ; la distinction entre parcours vu et terminé permet de reprendre un parcours incomplet sans le forcer à chaque lancement. Les remplacements JSON utilisent des fichiers temporaires uniques, des écritures synchronisées et un verrou partagé. Une erreur pendant une sauvegarde de plusieurs fichiers déclenche une tentative de restauration des fichiers précédents. Le fichier réel observé pendant cet audit indiquait déjà `onboardingDone: true` : un effacement de ce fichier n’a pas été reproduit.

La résolution des dossiers et la lecture des fiches de modèles sont centralisées. Les fiches locales Civitai/Stability Matrix, y compris celles avec BOM, restent prioritaires. Les métadonnées safetensors servent de repli ; le nom du fichier ne suffit jamais à affirmer la compatibilité. Le cache des fiches est borné et invalidé sur modification du fichier. Le navigateur reçoit les familles par lots de cent modèles.

Le nouveau catalogue Civitai utilise les API du fournisseur, la pagination par curseur et le circuit d’import existant. Les domaines sont limités à `.com` et `.red` ; les images passent par le compagnon, avec contrôle du domaine, limites de taille, redimensionnement et cache borné. Les clés facultatives restent en mémoire. Le catalogue affiche les résultats non marqués adultes par le fournisseur. La version du fichier, sa catégorie et son installation sont confirmées avant téléchargement. Un ancien compagnon conserve l’import direct lorsqu’il le prend en charge et affiche une demande de mise à jour pour le catalogue.

Référence d’API : [documentation Civitai](https://github.com/civitai/civitai-developer-docs/blob/main/site/reference/models.md).

## Vérifications

- 54 tests Vitest et 47 tests Node/PowerShell réussis ; les tests serveur et catalogue concernés par les dernières validations d’entrée ont été rejoués avec succès.
- 6 tests Rust Studio réussis, dont huit écritures concurrentes des réglages, conservation de l’onboarding et lecture avec BOM.
- 66 scénarios navigateur couverts au total : 64 réussis au passage complet initial ; la régression de message avec un ancien compagnon a été corrigée, puis les six parcours concernés, dont un nouveau scénario de compatibilité, ont réussi. Les serveurs de test utilisent des ports dédiés et refusent de réutiliser un serveur d’un autre projet.
- Recherches réelles sur Civitai `.com` et `.red`, filtre Illustrious/LoRA, résultats et curseur reçus.
- Émulateur Primio Medium API 36.1 : connexion native HTTPS au compagnon de validation, catalogue `.red`, illustration chargée et fichier de la version choisie présenté dans la bonne catégorie. Aucun téléchargement supplémentaire de plusieurs centaines de Mo n’a été imposé. Le circuit d’installation, de contrôle du fichier et de synchronisation est couvert par les tests avec données contrôlées.
- Bibliothèque réelle : le checkpoint `novaAnimeXL_ilV190.safetensors` est identifié comme Illustrious ; 699 LoRA sur 798 sont proposés. Chaque ligne visible porte cette famille. Le bouton d’affichage complet retrouve les 798 fichiers.
- APK arm64 release 0.15.0 / code 15000 compilée, optimisée, signée avec la clé de production existante et installée sur l’émulateur. Installateur Windows x64 Studio 0.5.0 compilé avec le compagnon actualisé.

## Limites

Pas de test sur téléphone physique ni depuis un réseau mobile externe pendant cet audit. La validation Android utilise une redirection ADB vers un compagnon isolé sur loopback, avec l’identité existante et le moteur réel. La compatibilité déclarée par famille ne garantit pas la qualité artistique d’une combinaison.

Le remplacement local de Studio a été refusé par le contrôle automatique d’approbation (« bloqué par la politique »). Studio 0.4.0 est donc resté installé ; les corrections Rust 0.5.0 ont été compilées et testées, mais pas exercées dans une installation Windows neuve pendant cette livraison. L’accès existant a été rétabli avec le compagnon déjà installé. Installer Studio 0.5.0 est nécessaire pour rendre les nouvelles corrections permanentes sur ce PC.

ARTEMIS a fourni les captures et états de l’émulateur. Son mode autonome n’était pas disponible faute de clé de modèle multimodal ; les interactions ont été effectuées par ADB et par le WebView Android instrumenté.
