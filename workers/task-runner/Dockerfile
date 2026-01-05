FROM node:20

# Install system deps
RUN apt-get update && apt-get install -y bash git curl apt-transport-https ca-certificates gnupg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    apt-get update && apt-get install -y google-cloud-cli && \
    rm -rf /var/lib/apt/lists/*

# Clone and setup workspace
WORKDIR /workspace
RUN git clone --depth 1 https://github.com/jasoncrites/ai-music-studio.git . || \
    git clone --depth 1 https://github.com/jasoncrites/products.git . || true
RUN npm install --legacy-peer-deps 2>/dev/null || true

# Setup runner
WORKDIR /app
RUN npm init -y && npm i express @google-cloud/firestore
COPY index.js .

ENV WORKSPACE=/workspace
CMD ["node", "index.js"]
