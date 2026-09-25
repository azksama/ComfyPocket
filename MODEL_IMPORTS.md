# Importer des modèles sur le PC

Dans Mochi Android, ouvrez **Atelier → Installer un modèle depuis un lien** (également accessible dans Paramètres). Collez une page de modèle Civitai `.com` ou `.red`, un lien de téléchargement Civitai, une page de dépôt Hugging Face ou le lien `blob` / `resolve` d’un fichier.

Analysez le lien, choisissez le fichier/version et vérifiez sa catégorie. La catégorie est proposée lorsque les métadonnées permettent de la reconnaître. Le premier dossier supplémentaire configuré pour cette catégorie est utilisé ; sinon, le dossier standard de ComfyUI est utilisé. Les modèles, LoRAs, VAE, upscalers, embeddings, ControlNet, modèles de diffusion, encodeurs de texte et CLIP Vision sont proposés.

Le téléchargement et sa vérification se déroulent sur le PC. Vous pouvez fermer l’écran ou quitter Android. La liste permet de suivre la progression et d’annuler. Une fois installé, le catalogue ComfyUI est rechargé automatiquement, sans modifier le prompt ni le modèle sélectionné. Si ComfyUI ne répond pas, l’actualisation est réessayée.

Une clé Civitai ou Hugging Face peut être fournie pour un fichier privé ou nécessitant une connexion. Elle est limitée à l’import, conservée uniquement en mémoire et envoyée uniquement au domaine du fournisseur, jamais aux CDN après redirection. Les conditions et autorisations du fournisseur doivent être acceptées sur son site.

Les fichiers existants ne sont jamais remplacés. Le SHA-256 est vérifié lorsqu’il est publié. Le fichier temporaire n’est installé qu’après réception complète. Après un arrêt du PC, un téléchargement incomplet est signalé et doit être relancé ; il n’est pas repris automatiquement. La fermeture normale de Mochi Studio dans la zone de notification laisse les services fonctionner. Studio bloque l’arrêt du moteur et son remplacement par une mise à jour tant qu’un import est actif.

Limites : fichiers de poids autonomes (`safetensors`, `ckpt`, `pt`, `pth`, `bin`, `gguf`), 64 Go par fichier, huit tâches en attente/actives. Pas d’installation d’archives, scripts, custom nodes, pipelines Diffusers complets ou fichiers fragmentés. L’installation d’un fichier ne garantit pas sa compatibilité avec le workflow sélectionné ; les formats GGUF notamment nécessitent les nœuds correspondants.

Nécessite Android **0.12.0** et Mochi Studio **0.3.0**, ou le compagnon de cette même version. Aucun renouvellement de certificat n’est nécessaire.

Références : [API Civitai](https://github.com/civitai/civitai/wiki/REST-API-Reference), [API Hugging Face](https://huggingface.co/docs/hub/api).
