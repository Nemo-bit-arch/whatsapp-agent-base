Configure le projet pour un nouveau client. Arguments attendus : nom secteur description (separes par des espaces).
Arguments recus : $ARGUMENTS

Fais les etapes suivantes :

1. Cree un fichier `.env` a la racine (copie de `.env.example`) avec :
   - CLIENT_NAME = le nom du client
   - SECTOR = le secteur indique
   - CLIENT_DESCRIPTION = la description fournie
   - Les autres variables avec des valeurs placeholder a remplir

2. Verifie que le secteur existe dans `agent/core/classifier.js`. Si non, indique qu'il faut d'abord lancer `/add-sector [secteur]`.

3. Affiche les instructions de deploiement :
   - Commandes a lancer (npm install, db:init, start)
   - Configuration n8n necessaire (workflow webhook)
   - Variables a remplir dans le .env
