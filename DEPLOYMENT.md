# Sofi Wellness Web App - Deployment Guide

This guide explains how to deploy the Sofi web application to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Supabase Project**: Set up your Supabase project with the database migration
3. **API Keys**: Obtain OpenAI and Gemini API keys
4. **GitHub Repository**: Push your code to GitHub

## Environment Variables

Configure these environment variables in your Vercel project:

### Required Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# AI API Keys
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key

# Optional: Additional APIs
EDAMAM_APP_ID=your-edamam-app-id
EDAMAM_APP_KEY=your-edamam-app-key
NUTRITIONIX_APP_ID=your-nutritionix-app-id
NUTRITIONIX_API_KEY=your-nutritionix-api-key

# Optional: Analytics & Monitoring
POSTHOG_KEY=your-posthog-key
POSTHOG_HOST=https://app.posthog.com
SENTRY_DSN=your-sentry-dsn
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=your-sentry-project
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

## Deployment Steps

### 1. Supabase Setup

First, set up your Supabase project:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-id

# Run migrations
supabase db push

# Set up storage buckets
# Go to Supabase Dashboard > Storage and create:
# - food-photos (private bucket)
# - voice-notes (private bucket)
```

### 2. Vercel Deployment

#### Option A: Deploy via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Configure project settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: Leave empty (monorepo detected)
   - **Build Command**: `cd apps/web && pnpm build`
   - **Output Directory**: `apps/web/.next`
   - **Install Command**: `pnpm install`

#### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from root directory
vercel

# Follow prompts and set configuration as above
```

### 3. Environment Variables Setup

In Vercel Dashboard > Project > Settings > Environment Variables:

1. Add all required environment variables
2. Set them for all environments (Production, Preview, Development)
3. Redeploy the project after adding variables

### 4. Domain Configuration

1. Go to Vercel Dashboard > Project > Settings > Domains
2. Add your custom domain (optional)
3. Update `NEXT_PUBLIC_APP_URL` environment variable with your domain

### 5. Supabase Authentication Setup

In Supabase Dashboard > Authentication > URL Configuration:

1. **Site URL**: `https://your-app.vercel.app`
2. **Redirect URLs**: Add these URLs:
   - `https://your-app.vercel.app/auth/callback`
   - `https://your-app.vercel.app/login`
   - `https://your-app.vercel.app/dashboard`

### 6. Storage Bucket Policies

Set up Row Level Security policies for storage buckets:

```sql
-- Food photos bucket policy
CREATE POLICY "Users can upload their own food photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'food-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own food photos" ON storage.objects
FOR SELECT USING (
  bucket_id = 'food-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Voice notes bucket policy
CREATE POLICY "Users can upload their own voice notes" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'voice-notes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own voice notes" ON storage.objects
FOR SELECT USING (
  bucket_id = 'voice-notes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## Post-Deployment Verification

### 1. Health Checks

Visit these URLs to verify deployment:

- `https://your-app.vercel.app` - Main app
- `https://your-app.vercel.app/login` - Authentication
- `https://your-app.vercel.app/manifest.json` - PWA manifest
- `https://your-app.vercel.app/sw.js` - Service worker

### 2. PWA Installation

1. Open the app in Chrome/Edge
2. Look for the install prompt in the address bar
3. Test the install flow

### 3. API Endpoints

Test API endpoints (replace with your domain):

```bash
# Test with curl (requires authentication)
curl -X POST https://your-app.vercel.app/api/storage/sign \
  -H "Content-Type: application/json" \
  -d '{"bucket":"food-photos","path":"test.jpg"}'
```

### 4. Features Testing

- [ ] User registration/login
- [ ] Photo upload and AI analysis
- [ ] Voice recording and transcription
- [ ] Manual food entry
- [ ] Mood tracking
- [ ] Calendar view
- [ ] Insights generation
- [ ] Profile settings
- [ ] PWA installation
- [ ] Offline functionality

## Monitoring & Analytics

### Analytics Setup (Optional)

If using PostHog:
1. Create account at [posthog.com](https://posthog.com)
2. Add `POSTHOG_KEY` and `POSTHOG_HOST` environment variables
3. Analytics will be automatically tracked

### Error Monitoring (Optional)

If using Sentry:
1. Create project at [sentry.io](https://sentry.io)
2. Add Sentry environment variables
3. Errors will be automatically reported

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check that all environment variables are set
   - Verify Node.js version compatibility
   - Check for TypeScript errors

2. **Authentication Issues**
   - Verify Supabase URL configuration
   - Check redirect URLs in Supabase dashboard
   - Ensure NEXT_PUBLIC_APP_URL is correct

3. **API Errors**
   - Verify API keys are correctly set
   - Check Supabase RLS policies
   - Monitor Vercel function logs

4. **PWA Issues**
   - Verify manifest.json is accessible
   - Check service worker registration
   - Test on HTTPS (required for PWA)

### Debug Commands

```bash
# Check Vercel logs
vercel logs your-deployment-url

# Test Supabase connection
supabase db ping

# Validate environment variables
vercel env ls
```

## Performance Optimization

### Recommended Settings

1. **Vercel Analytics**: Enable in project settings
2. **Edge Functions**: Consider for API routes with global usage
3. **Image Optimization**: Enabled by default with Next.js
4. **Caching**: Configured in vercel.json

### Monitoring

Monitor these metrics:
- Core Web Vitals
- API response times
- Error rates
- User engagement

## Security Considerations

1. **Environment Variables**: Never commit secrets to version control
2. **CORS**: Configured for secure API access
3. **CSP Headers**: Implemented for XSS protection
4. **RLS Policies**: Ensure proper data isolation
5. **API Rate Limiting**: Consider implementing for production

## Scaling Considerations

For high-traffic deployments:

1. **Database**: Consider Supabase Pro plan
2. **File Storage**: Monitor storage usage and costs
3. **API Usage**: Monitor OpenAI/Gemini API costs
4. **Vercel**: Consider Pro plan for team features

## Support

For deployment issues:
1. Check Vercel documentation
2. Review Supabase docs
3. Check GitHub issues in the repository
4. Contact the development team

## Maintenance

Regular maintenance tasks:
1. Update dependencies monthly
2. Monitor error rates and performance
3. Review and rotate API keys quarterly
4. Update Supabase and Vercel as needed
5. Test PWA functionality across browsers