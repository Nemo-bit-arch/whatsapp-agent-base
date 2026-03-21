FROM node:20-slim

WORKDIR /app

# Installer les dependances de build pour better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

# Creer le dossier sessions
RUN mkdir -p memory/sessions

# Initialiser la DB
RUN node db/database.js --init

EXPOSE 3000

CMD ["node", "index.js"]
