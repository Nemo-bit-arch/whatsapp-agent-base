#!/bin/bash
# Script de deploiement WhatsApp Agent
set -e

echo "=== Deploiement WhatsApp Agent ==="

# 1. Pull derniere version
echo "[1/4] Git pull..."
git pull

# 2. Install dependances
echo "[2/4] npm install..."
npm install --production

# 3. Redemarrer le container sans downtime
echo "[3/4] Rebuild et redemarrage du container..."
docker compose up -d --build --no-deps whatsapp-agent

# 4. Afficher les logs
echo "[4/4] Logs (50 dernieres lignes):"
sleep 2
docker compose logs --tail=50 whatsapp-agent

echo ""
echo "=== Deploiement termine ==="
echo "Health check: curl http://localhost:3000/health"
