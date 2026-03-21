Simule un echange WhatsApp complet dans le terminal pour tester l'agent sans Evolution API.
Arguments : $ARGUMENTS (format: "message" secteur — le secteur est optionnel)

Fais les etapes suivantes :

1. Parse les arguments pour extraire le message et le secteur optionnel

2. Lance un curl vers le serveur local :
```
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"phone":"test-241000000000","message":"[LE MESSAGE]","pushName":"Testeur"}' | jq .
```

3. Affiche la reponse formatee

4. Si le serveur ne repond pas, indique de lancer `npm run dev` d'abord

5. Si un secteur est specifie, mentionne que le secteur force dans .env prendra le dessus sur la detection automatique
