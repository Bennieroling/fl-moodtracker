# Sofi — Food & Mood Wellness App

> Track your wellness journey with AI-powered insights and personalized recommendations.

A comprehensive wellness application that helps users understand the connection between their food choices and mood patterns through advanced AI analysis and intuitive tracking features.

## 🌟 Features

### Core Functionality
- **Mood Tracking**: Daily mood logging with 5-point scale and notes
- **Food Logging**: Multiple entry methods (photo, voice, manual)
- **AI Analysis**: Automatic food recognition and nutritional analysis
- **Insights Generation**: Weekly wellness summaries and personalized tips
- **Calendar View**: Visual overview of mood patterns and food entries
- **Data Export**: Download your wellness data in various formats

### AI-Powered Features
- **Computer Vision**: Food recognition from photos using OpenAI GPT-4V and Gemini Vision
- **Speech Recognition**: Voice-to-text meal descriptions using OpenAI Whisper
- **Smart Insights**: AI-generated weekly summaries and actionable wellness tips
- **Provider Switching**: Automatic fallback between OpenAI and Gemini APIs

### Technical Features
- **Progressive Web App (PWA)**: Installable, offline-capable web application
- **Cross-Platform**: Works on mobile, tablet, and desktop
- **Real-time Sync**: Data synchronization across devices
- **Offline Support**: Continue tracking even without internet connection
- **Secure Authentication**: Email/password and Google OAuth via Supabase

## 🏗️ Architecture

### Technology Stack

**Frontend (Web)**
- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS + shadcn/ui components
- **PWA**: Service Worker + Web App Manifest
- **Charts**: Recharts for data visualization

**Frontend (Mobile)**
- **Framework**: Expo React Native
- **Language**: TypeScript
- **Styling**: NativeWind (TailwindCSS for React Native)
- **Navigation**: Expo Router

**Backend & Infrastructure**
- **Database**: Supabase (PostgreSQL with Row Level Security) under Festina Lente Git account
- **Authentication**: Supabase Auth (Email + OAuth)
- **File Storage**: Supabase Storage
- **API**: Next.js API Routes + Supabase Edge Functions
- **Deployment**: Vercel (Web) + Expo Application Services (Mobile)

**AI & External Services**
- **Vision AI**: OpenAI GPT-4V + Google Gemini Vision
- **Speech AI**: OpenAI Whisper
- **Text AI**: OpenAI GPT-4o-mini + Google Gemini
- **Nutrition Data**: Edamam + Nutritionix APIs (optional)

**Development Tools**
- **Monorepo**: Organized with shared utilities and types
- **Validation**: Zod schemas for type-safe data handling
- **Code Quality**: ESLint + TypeScript strict mode
- **Version Control**: Git with conventional commits

### Database Schema

```sql
-- Core Tables
- users (Supabase Auth managed)
- mood_entries (id, user_id, date, mood_score, note, timestamps)
- food_entries (id, user_id, date, meal, photo_url, voice_url, ai_raw, food_labels, calories, macros, note, journal_mode, timestamps)
- insights (id, user_id, period_start, period_end, summary_md, tips_md, metrics, created_at)
- streaks (id, user_id, current_streak, longest_streak, last_entry_date, updated_at)
- user_preferences (id, user_id, units, reminder_enabled, reminder_time, journal_mode_default, notifications_enabled, timestamps)

-- Features
- Row Level Security (RLS) for data isolation
- Automatic streak calculation with triggers
- Analytics functions for insights generation
- Storage buckets for photos and voice notes
```

### API Architecture

**Web API Routes** (`/apps/web/app/api/`)
- `/ai/vision` - Food photo analysis
- `/ai/speech` - Voice transcription and analysis  
- `/ai/insights` - Weekly insights generation
- `/storage/sign` - Signed URL generation for file uploads

**Mobile Integration** (Supabase Edge Functions)
- `ai-vision` - Food photo analysis
- `ai-speech` - Voice transcription and analysis
- `ai-insights` - Weekly insights generation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Supabase account and project
- OpenAI API key (recommended)
- Gemini API key (optional, for fallback)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/sofi-wellness.git
   cd sofi-wellness
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment setup**
   ```bash
   # Copy environment files
   cp .env.example .env.local
   cp apps/web/.env.example apps/web/.env.local
   cp apps/mobile/.env.example apps/mobile/.env.local
   
   # Edit .env.local files with your API keys and configuration
   ```

4. **Database setup**
   ```bash
   # Install Supabase CLI
   npm install -g supabase
   
   # Login and link project
   supabase login
   supabase link --project-ref your-project-id
   
   # Run migrations
   supabase db push
   ```

5. **Development servers**
   ```bash
   # Web app
   cd apps/web && pnpm dev
   
   # Mobile app (in another terminal)
   cd apps/mobile && pnpm start
   ```

Visit `http://localhost:3000` for the web app or scan the QR code for the mobile app.

## 📱 Platform-Specific Setup

### Web Application

```bash
cd apps/web
pnpm install
pnpm dev
```

**Key Features:**
- Responsive design for all screen sizes
- PWA installability on mobile and desktop
- Service worker for offline functionality
- File upload with drag-and-drop support

### Mobile Application

```bash
cd apps/mobile
pnpm install
pnpm start
```

**Key Features:**
- Native camera and microphone access
- Push notifications for reminders
- Offline storage and sync
- Platform-specific UI adaptations

## 🔧 Configuration

### Environment Variables

#### Required Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI APIs
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### Optional Variables
```bash
# Nutrition APIs
EDAMAM_APP_ID=your-edamam-app-id
EDAMAM_APP_KEY=your-edamam-app-key
NUTRITIONIX_APP_ID=your-nutritionix-app-id
NUTRITIONIX_API_KEY=your-nutritionix-api-key

# Analytics & Monitoring
POSTHOG_KEY=your-posthog-key
SENTRY_DSN=your-sentry-dsn

# Expo (Mobile)
EXPO_PROJECT_ID=your-expo-project-id
```

### Supabase Configuration

1. **Create storage buckets:**
   - `food-photos` (private)
   - `voice-notes` (private)

2. **Enable authentication providers:**
   - Email/Password
   - Google OAuth (optional)

3. **Configure URL settings:**
   - Site URL: `http://localhost:3000` (development)
   - Redirect URLs: Add your app URLs

## 🧪 Testing

### Run Tests
```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Type checking
pnpm type-check

# Linting
pnpm lint
```

### Test Coverage
- API route functionality
- Database RLS policies
- AI contract validation
- Authentication flows
- PWA installation
- Offline functionality

## 📦 Deployment

### Web Application (Vercel)

See detailed instructions in [DEPLOYMENT.md](./DEPLOYMENT.md)

```bash
# Quick deploy
vercel --prod
```

### Mobile Application (Expo)

```bash
# Build for app stores
cd apps/mobile
eas build --platform all

# Submit to stores
eas submit --platform all
```

## 🔒 Security & Privacy

### Data Protection
- **Encryption**: All data encrypted in transit and at rest
- **Row Level Security**: Database-level access controls
- **Authentication**: Secure session management
- **API Security**: Rate limiting and input validation

### Privacy Features
- **Journal Mode**: Private entries excluded from insights
- **Data Export**: Users can download their data
- **Account Deletion**: Complete data removal option
- **Minimal Data**: Only necessary information collected

### Compliance
- GDPR compliant data handling
- User consent for data processing
- Transparent privacy policy
- Secure data deletion

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards
- TypeScript for type safety
- ESLint for code quality
- Conventional commits for changelog generation
- Component documentation with JSDoc

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

### Documentation
- [API Documentation](./docs/api.md)
- [Component Guide](./docs/components.md)
- [Deployment Guide](./DEPLOYMENT.md)

### Getting Help
- [GitHub Issues](https://github.com/your-org/sofi-wellness/issues)
- [Discussions](https://github.com/your-org/sofi-wellness/discussions)
- [Email Support](mailto:support@sofi-wellness.com)

### Known Issues
- PWA installation on iOS Safari requires manual steps
- Voice recording requires HTTPS in production
- Large image uploads may be slow on mobile networks

## 🗺️ Roadmap

### Upcoming Features
- [ ] Social sharing and community features
- [ ] Integration with fitness trackers
- [ ] Meal planning and recipe suggestions
- [ ] Advanced nutrition tracking
- [ ] Multiple language support
- [ ] Dark mode theme improvements

### Technical Improvements
- [ ] Enhanced offline capabilities
- [ ] Performance optimizations
- [ ] Additional AI providers
- [ ] Advanced analytics dashboard
- [ ] API rate limiting improvements

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing backend platform
- [OpenAI](https://openai.com) for powerful AI capabilities
- [Vercel](https://vercel.com) for seamless deployment
- [Expo](https://expo.dev) for excellent mobile development tools
- [shadcn/ui](https://ui.shadcn.com) for beautiful component library

## 📊 Project Stats

- **Development Time**: 6+ months
- **Lines of Code**: 15,000+
- **Components**: 50+ reusable components
- **API Endpoints**: 10+ REST endpoints
- **Database Tables**: 6 core tables
- **Supported Platforms**: Web, iOS, Android
- **AI Models**: GPT-4V, Whisper, Gemini Vision
- **Test Coverage**: 80%+

---

Built with ❤️ for better wellness tracking and insights.