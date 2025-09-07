# Supabase Setup Guide

## Current Status: Demo Mode ✅

The web application is currently running in **demo mode** with placeholder Supabase credentials. This allows you to:
- ✅ Preview the complete UI and navigation
- ✅ See all screens and components
- ✅ Test the overall user experience
- ⚠️ Note: Database features won't work without real credentials

## Setting Up Real Supabase Credentials

When you're ready to connect to a real Supabase backend:

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up/login and create a new project
3. Wait for the project to initialize

### 2. Get Your Credentials
1. Go to **Settings > API** in your Supabase dashboard
2. Copy the following values:
   - **Project URL** (starts with `https://`)
   - **anon/public key** (starts with `eyJ`)
   - **service_role key** (starts with `eyJ`) - Keep this secret!

### 3. Update Environment Variables
Edit `/Users/benvandijk/Documents/Qoder/Wellness/apps/web/.env.local`:

```bash
# Replace these demo values with your real Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-real-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-real-service-role-key-here
```

### 4. Set Up the Database
Run the migration file to create the required tables:
```sql
-- Apply the migration from: /Users/benvandijk/Documents/Qoder/Wellness/supabase/migrations/000_init.sql
```

### 5. Configure Storage
1. Go to **Storage** in your Supabase dashboard
2. Create two buckets:
   - `food-photos` (for food images)
   - `voice-notes` (for audio recordings)
3. Set appropriate bucket policies for user access

### 6. Deploy Edge Functions (Optional)
For AI features, deploy the Edge Functions:
```bash
# From the project root
supabase functions deploy ai-vision
supabase functions deploy ai-speech
supabase functions deploy ai-insights
```

### 7. Restart Development Server
After updating credentials:
```bash
npm run dev
```

## Features Available in Demo Mode

### ✅ Working Features
- Complete UI navigation
- All screens and layouts
- Component interactions
- Form validation (client-side)
- Responsive design testing
- Dark/light mode toggle

### ⚠️ Requires Real Supabase
- User authentication
- Data persistence (mood/food entries)
- File uploads (photos/voice)
- AI features (requires Edge Functions + API keys)
- Real-time synchronization

## Demo vs Production

| Feature | Demo Mode | With Real Supabase |
|---------|-----------|-------------------|
| UI/UX Preview | ✅ Full Access | ✅ Full Access |
| Authentication | ❌ Mock Only | ✅ Real Auth |
| Data Storage | ❌ Local Only | ✅ Cloud Database |
| File Uploads | ❌ Mock Only | ✅ Real Storage |
| AI Features | ❌ No Processing | ✅ Full AI (with keys) |
| Multi-device Sync | ❌ No Sync | ✅ Real-time Sync |

## Next Steps

1. **Immediate**: Use the preview to explore the complete application interface
2. **When Ready**: Set up a real Supabase project using this guide
3. **Optional**: Configure AI API keys for advanced features
4. **Deploy**: Use the deployment guide for production setup

The application is fully functional from a UI/UX perspective - you can see exactly how it will work once connected to a real backend!

---
*Current Mode: Demo with Mock Data*  
*Server: Running on http://localhost:3002*  
*Environment: Development with .env.local*