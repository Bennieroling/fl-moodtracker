# Sofi Wellness - Production Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the Sofi Wellness application to production, including both the mobile React Native app and the web Next.js application.

## Prerequisites

### Required Accounts
- [ ] Supabase account with project created
- [ ] Expo account for mobile app deployment
- [ ] Vercel account for web app deployment
- [ ] OpenAI API account
- [ ] Google AI (Gemini) account
- [ ] PostHog account for analytics
- [ ] Sentry account for error monitoring
- [ ] Apple Developer account (for iOS deployment)
- [ ] Google Play Console account (for Android deployment)

### Development Environment
- Node.js 18+ installed
- Expo CLI installed globally
- Supabase CLI installed
- Git repository configured

## Supabase Production Setup

### 1. Database Migration
```bash
# Navigate to project root
cd /path/to/Wellness

# Initialize Supabase project (if not done)
supabase init

# Link to your production project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push

# Verify migration
supabase db diff
```

### 2. Storage Bucket Setup
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
('food-photos', 'food-photos', false),
('voice-notes', 'voice-notes', false);

-- Set up bucket policies for authenticated users
CREATE POLICY "Users can upload their own photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'food-photos' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own photos" ON storage.objects
FOR SELECT USING (
  bucket_id = 'food-photos'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Similar policies for voice-notes bucket
CREATE POLICY "Users can upload their own voice notes" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'voice-notes'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own voice notes" ON storage.objects
FOR SELECT USING (
  bucket_id = 'voice-notes'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. Edge Functions Deployment
```bash
# Deploy all Edge Functions
supabase functions deploy ai-vision
supabase functions deploy ai-speech  
supabase functions deploy ai-insights

# Set environment variables for Edge Functions
supabase secrets set OPENAI_API_KEY=your_openai_key
supabase secrets set GEMINI_API_KEY=your_gemini_key
```

### 4. Authentication Setup
1. Enable Email authentication in Supabase Dashboard
2. Configure Google OAuth:
   - Add Google provider in Authentication > Providers
   - Set up OAuth consent screen in Google Cloud Console
   - Add authorized redirect URIs
3. Configure email templates in Authentication > Templates

## Mobile App Deployment (React Native/Expo)

### 1. Environment Configuration
Create production environment file:
```bash
# apps/mobile/.env.production
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_POSTHOG_KEY=your_posthog_key
EXPO_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### 2. Build Configuration
Update `apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "Sofi Wellness",
    "slug": "sofi-wellness",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.sofiwellness",
      "buildNumber": "1.0.0"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.yourcompany.sofiwellness",
      "versionCode": 1
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "your-eas-project-id"
      }
    },
    "plugins": [
      "expo-notifications",
      "expo-image-picker",
      "expo-av"
    ]
  }
}
```

### 3. EAS Build Setup
```bash
# Navigate to mobile app directory
cd apps/mobile

# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Initialize EAS
eas build:configure

# Build for iOS and Android
eas build --platform all --profile production

# Submit to app stores
eas submit --platform ios
eas submit --platform android
```

### 4. Push Notifications Setup
1. Configure Firebase Cloud Messaging for Android
2. Set up Apple Push Notification service for iOS
3. Update Expo push notification settings

## Web App Deployment (Next.js/Vercel)

### 1. Environment Variables
Set up production environment variables in Vercel dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### 2. Vercel Deployment
```bash
# Navigate to web app directory
cd apps/web

# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel --prod

# Or push to GitHub and enable auto-deployment
git push origin main
```

### 3. Domain Configuration
1. Add custom domain in Vercel dashboard
2. Configure DNS records
3. Enable HTTPS/SSL certificate

## Production Configuration

### 1. Analytics Setup (PostHog)
1. Create PostHog project
2. Copy project API key
3. Configure event tracking:
   ```typescript
   // apps/mobile/lib/analytics.ts
   import posthog from 'posthog-react-native';
   
   export const analytics = {
     initialize: () => {
       posthog.setup(process.env.EXPO_PUBLIC_POSTHOG_KEY!, {
         host: 'https://app.posthog.com'
       });
     },
     track: (event: string, properties?: any) => {
       posthog.capture(event, properties);
     }
   };
   ```

### 2. Error Monitoring Setup (Sentry)
1. Create Sentry project
2. Copy DSN
3. Initialize Sentry:
   ```typescript
   // apps/mobile/lib/sentry.ts
   import * as Sentry from '@sentry/react-native';
   
   Sentry.init({
     dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
     environment: 'production'
   });
   ```

### 3. Performance Monitoring
1. Enable performance monitoring in Sentry
2. Set up error boundaries in React components
3. Configure crash reporting

## Security Checklist

### Database Security
- [ ] RLS policies enabled on all tables
- [ ] Service role key secured (server-side only)
- [ ] Anonymous key properly scoped
- [ ] Database backup enabled
- [ ] SSL/TLS enforced

### API Security
- [ ] AI API keys secured in environment variables
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] Authentication required for all operations
- [ ] CORS properly configured

### Mobile App Security
- [ ] Code obfuscation enabled
- [ ] API keys not hardcoded
- [ ] Certificate pinning (optional)
- [ ] Root/jailbreak detection (optional)
- [ ] Biometric authentication (optional)

### Web App Security
- [ ] CSP headers configured
- [ ] HTTPS enforced
- [ ] Environment variables secured
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented

## Monitoring and Maintenance

### Health Checks
Set up monitoring for:
- [ ] Supabase database connectivity
- [ ] API endpoint availability
- [ ] Edge function performance
- [ ] Mobile app crash rates
- [ ] Web app performance metrics

### Backup Strategy
- [ ] Daily database backups
- [ ] File storage backups
- [ ] Environment configuration backups
- [ ] Code repository backups

### Update Strategy
- [ ] Staged deployment process
- [ ] Feature flags for gradual rollouts
- [ ] Rollback procedures
- [ ] User notification system

## Go-Live Checklist

### Pre-Launch
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Load testing performed
- [ ] User acceptance testing completed
- [ ] App store submissions approved

### Launch Day
- [ ] DNS records updated
- [ ] CDN configured
- [ ] Monitoring alerts active
- [ ] Support team prepared
- [ ] Marketing materials ready
- [ ] User documentation available

### Post-Launch
- [ ] Monitor error rates
- [ ] Track user engagement
- [ ] Collect user feedback
- [ ] Performance optimization
- [ ] Feature usage analysis
- [ ] Plan next iteration

## Support Information

### Documentation
- [Supabase Documentation](https://supabase.com/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)

### Contact Information
- Development Team: [team@yourcompany.com]
- Technical Support: [support@yourcompany.com]
- Emergency Contact: [emergency@yourcompany.com]

## Troubleshooting

### Common Issues
1. **Database Connection Issues**
   - Check Supabase project status
   - Verify environment variables
   - Review RLS policies

2. **Build Failures**
   - Update dependencies
   - Clear cache
   - Check environment configuration

3. **Performance Issues**
   - Review database queries
   - Optimize image sizes
   - Enable caching

For detailed troubleshooting, refer to the technical documentation or contact the development team.