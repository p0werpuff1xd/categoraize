#!/usr/bin/env bash

set -euo pipefail

# Deploy the already-built web container. The image is the only application
# artifact Cloud Run needs; Postgres, Redis, and secrets stay external.

SERVICE_NAME="${CLOUD_RUN_SERVICE:-categoraize}"
REGION="${CLOUD_RUN_REGION:-asia-southeast3}"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REPOSITORY="${GAR_REPOSITORY:-categoraize}"
IMAGE_NAME="${GAR_IMAGE_NAME:-web}"
DEPLOY_ONLY=false

for argument in "$@"; do
  case "${argument}" in
    --deploy-only)
      DEPLOY_ONLY=true
      ;;
    *)
      echo "Unknown argument: ${argument}" >&2
      echo "Usage: $0 [--deploy-only]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set GOOGLE_CLOUD_PROJECT or configure a default gcloud project." >&2
  exit 1
fi

REGISTRY="${REGION}-docker.pkg.dev"
IMAGE="${REGISTRY}/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}"

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location "${REGION}" \
  --project "${PROJECT_ID}" \
  >/dev/null 2>&1; then
  echo "Creating Artifact Registry repository ${REPOSITORY} in ${REGION}"
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format docker \
    --location "${REGION}" \
    --project "${PROJECT_ID}" \
    --description "Categoraize production containers"
fi

if [[ "${DEPLOY_ONLY}" == "true" ]]; then
  TAG="${IMAGE_TAG:-latest}"
else
  TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
fi

echo "Authenticating Docker with ${REGISTRY}"
gcloud auth configure-docker "${REGISTRY}" --quiet

if [[ "${DEPLOY_ONLY}" == "false" ]]; then
  export DOCKER_BUILDKIT=1
  echo "Loading the previous image cache"
  docker pull "${IMAGE}:latest" || true

  echo "Building ${IMAGE}:${TAG}"
  docker build \
    --file docker/Dockerfile.prod \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --cache-from "${IMAGE}:latest" \
    --tag "${IMAGE}:${TAG}" \
    --tag "${IMAGE}:latest" \
    .

  echo "Pushing ${IMAGE}:${TAG}"
  docker push "${IMAGE}:${TAG}"
  docker push "${IMAGE}:latest"
fi

echo "Deploying ${SERVICE_NAME} to Cloud Run in ${REGION}"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}:${TAG}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --quiet

echo "Deployed ${SERVICE_NAME} from ${IMAGE}:${TAG}"
