Ajoute un nouveau secteur "$ARGUMENTS" a l'agent WhatsApp. Fais les 3 etapes suivantes :

1. Cree le fichier `agent/prompts/overlays/$ARGUMENTS.md` en te basant sur `_template.md`. Remplis le avec des regles pertinentes pour le secteur "$ARGUMENTS" (contexte, ce que l'agent peut/ne peut pas faire, ton adapte).

2. Ajoute les mots-cles du secteur "$ARGUMENTS" dans `agent/core/classifier.js` dans l'objet SECTORS. Choisis 15-20 mots-cles pertinents pour ce secteur.

3. Ajoute les tools specifiques au secteur "$ARGUMENTS" dans `agent/tools/sector-tools.js`. Cree 2-3 tools utiles avec des definitions Claude API completes et des handlers placeholder.

Affiche un resume de ce qui a ete ajoute.
