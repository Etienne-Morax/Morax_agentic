#!/usr/bin/env bash
# Morax worker - build + deploy Cloud Run Job (europe-west1, scale-to-zero).
# Usage : GCP_PROJECT_ID=... ./deploy/cloud-run.sh
# Prerequis : gcloud CLI authentifie (gcloud auth login), projet + billing actifs,
# APIs activees (run.googleapis.com, artifactregistry.googleapis.com, cloudbuild.googleapis.com).
set -euo pipefail

REGION="${GCP_REGION:-europe-west1}"
PROJECT_ID="${GCP_PROJECT_ID:?Variable GCP_PROJECT_ID requise (ex: export GCP_PROJECT_ID=morax-xxxxx)}"
REPO="${AR_REPO:-morax}"
JOB_NAME="${CLOUD_RUN_JOB:-morax-worker}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/worker:$(date +%Y%m%d-%H%M%S)"
ENV_FILE="${WORKER_ENV_FILE:-worker/.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy] Fichier env introuvable : $ENV_FILE" >&2
  exit 1
fi

if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[deploy] Repo Artifact Registry '$REPO' absent, creation..."
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location "$REGION" \
    --project "$PROJECT_ID" \
    --description "Images worker Morax"
fi

echo "[deploy] Build image via Cloud Build -> $IMAGE"
gcloud builds submit . \
  --project "$PROJECT_ID" \
  --config /dev/stdin \
  --substitutions "_IMAGE=$IMAGE" <<'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'worker/Dockerfile', '-t', '$_IMAGE', '.']
images:
  - '$_IMAGE'
EOF

# Construit --set-env-vars=KEY1=val1,KEY2=val2 depuis le .env.local worker
# (ignore les lignes vides/commentees, echappe les virgules).
ENV_VARS=$(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/,/\\,/g' | paste -sd, -)
ENV_VARS="${ENV_VARS},MORAX_ENV=production,NODE_ENV=production"

echo "[deploy] Deploiement Cloud Run Job '$JOB_NAME' (region $REGION)"
gcloud run jobs deploy "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --set-env-vars "$ENV_VARS" \
  --max-retries 1 \
  --task-timeout 300

echo "[deploy] OK. Test manuel : gcloud run jobs execute $JOB_NAME --project $PROJECT_ID --region $REGION"
