# AI Music Studio - Cloud Run Deployment

## Deployment Summary

Successfully deployed AI Music Studio Next.js application to Google Cloud Run production environment.

### Service Details

- **Service Name**: ai-music-studio
- **Project**: truckerbooks-mvp-prod
- **Region**: us-central1
- **Platform**: Cloud Run (managed)

### URLs

- **Production URL**: https://ai-music-studio-2hdw2kcqpa-uc.a.run.app
- **Alternative URL**: https://ai-music-studio-32067823098.us-central1.run.app

### Configuration

#### Resources
- **Memory**: 1Gi
- **CPU**: 1 vCPU
- **Min Instances**: 0 (scales to zero)
- **Max Instances**: 10
- **Port**: 8080
- **Access**: Public (unauthenticated)

#### Environment Variables
- `GCP_PROJECT_ID`: truckerbooks-mvp-prod
- `GCP_REGION`: us-central1
- `NODE_ENV`: production
- `NEXT_PUBLIC_KERNEL_URL`: /api/cortex/control
- `ENABLE_REPLICATE`: true
- `MAX_AUDIO_DURATION_SECONDS`: 600
- `MAX_CONCURRENT_JOBS`: 5
- `CACHE_TTL_HOURS`: 24

#### Secrets (managed via Secret Manager)
- `REPLICATE_API_TOKEN`: Stored in us-central1 Secret Manager

### Container Image

- **Registry**: Google Container Registry (GCR)
- **Image**: gcr.io/truckerbooks-mvp-prod/ai-music-studio:latest
- **Digest**: sha256:d07238c4c9b20819624843e4ca16f0d74f28b8e8b53de80bebfaf5ae5d21f2a4

### Build Configuration

The Docker image uses a multi-stage build optimized for Next.js:
- **Base**: node:20-alpine
- **Output Mode**: standalone (optimized for containers)
- **Build Time**: ~3 minutes

### Deployment Files Created

1. **Dockerfile**: Multi-stage production build
2. **.dockerignore**: Optimized for faster builds
3. **cloudbuild.yaml**: Automated CI/CD configuration for Cloud Build
4. **next.config.ts**: Updated with standalone output mode

### Automated Deployments (Optional)

To enable automated deployments on git push:

1. Connect repository to Cloud Build:
   ```bash
   gcloud builds triggers create github \
     --repo-name=ai-music-studio \
     --repo-owner=YOUR_GITHUB_ORG \
     --branch-pattern="^main$" \
     --build-config=cloudbuild.yaml \
     --region=us-central1 \
     --project=truckerbooks-mvp-prod
   ```

2. The `cloudbuild.yaml` file will automatically:
   - Build the Docker image
   - Push to Container Registry
   - Deploy to Cloud Run

### Health Check

Service is responding successfully:
```bash
curl https://ai-music-studio-2hdw2kcqpa-uc.a.run.app/
# HTTP 200 OK
```

### Custom Domain (Optional)

To add a custom domain:

1. Verify domain ownership in Google Cloud Console
2. Create domain mapping:
   ```bash
   gcloud beta run domain-mappings create \
     --service=ai-music-studio \
     --domain=your-domain.com \
     --region=us-central1 \
     --project=truckerbooks-mvp-prod
   ```
3. Update DNS records as instructed

### Service Account Permissions

The service runs with:
- **Service Account**: 32067823098-compute@developer.gserviceaccount.com
- **Permissions**:
  - Secret Manager Secret Accessor (for REPLICATE_API_TOKEN)
  - Cloud Run Invoker (inherited)
  - Default compute service account permissions

### Monitoring & Logs

View logs:
```bash
gcloud run services logs read ai-music-studio \
  --region=us-central1 \
  --project=truckerbooks-mvp-prod \
  --limit=50
```

View metrics in Cloud Console:
https://console.cloud.google.com/run/detail/us-central1/ai-music-studio/metrics?project=truckerbooks-mvp-prod

### Cost Optimization

- Scales to zero when not in use (no idle costs)
- First 2 million requests/month are free (Cloud Run free tier)
- Estimated cost: ~$0.05-$0.50/day depending on usage

### Revision History

- **Current Revision**: ai-music-studio-00024-wxn
- **Traffic Split**: 100% to latest revision

### Next Steps

1. **Set up monitoring alerts** in Cloud Monitoring
2. **Configure custom domain** if needed
3. **Enable Cloud CDN** for static assets
4. **Set up Cloud Armor** for DDoS protection
5. **Configure CI/CD pipeline** with Cloud Build triggers

### Troubleshooting

If the service fails to start:
```bash
# Check service status
gcloud run services describe ai-music-studio \
  --region=us-central1 \
  --project=truckerbooks-mvp-prod

# View recent logs
gcloud run services logs read ai-music-studio \
  --region=us-central1 \
  --project=truckerbooks-mvp-prod \
  --limit=100
```

### Rollback

To rollback to a previous revision:
```bash
gcloud run services update-traffic ai-music-studio \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1 \
  --project=truckerbooks-mvp-prod
```

---

**Deployment Date**: January 5, 2026
**Deployed By**: Claude Code (Automated)
**Status**: Production - Live
