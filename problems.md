# Project Problems & Resolution Plan

## Executive Summary

This project has **264+ critical issues** that need immediate attention before production deployment. The problems range from **critical security vulnerabilities** to **major TypeScript errors** and **architectural inconsistencies**.

## Critical Issues Requiring Immediate Action (🚨 HIGH PRIORITY)

### 1. **SECURITY VULNERABILITIES - 🚨 IMMEDIATE**

#### Issue: Exposed API Keys in Repository
- **Files Affected**: `apps/web/.env.local`
- **Severity**: CRITICAL - Production API keys committed to repository
- **Impact**: Potential unauthorized access to OpenAI, Gemini, and Supabase services

**Exposed Keys:**
```bash
OPENAI_API_KEY=sk-proj-j-WLtF2ZjfGDbu2IOMqT...
GEMINI_API_KEY=AIzaSyCM4-lk7PczDGFdnawZ...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```



**Solution:**
```bash
# 1. IMMEDIATELY revoke all exposed API keys
# 2. Remove from git history
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch apps/web/.env.local' --prune-empty --tag-name-filter cat -- --all
# 3. Add to .gitignore
echo "*.env.local" >> .gitignore
# 4. Generate new API keys
# 5. Set environment variables in deployment platform
```

### 2. **TYPESCRIPT COMPILATION ERRORS - 🚨 IMMEDIATE**

#### Issue: 50+ TypeScript Errors Preventing Build
**Major Issues:**
- **Database Type Mismatches**: `never` types in Supabase operations
- **Missing Dependencies**: Cannot find modules
- **Type Assertion Errors**: Unsafe type operations

**Critical Files with Errors:**
- `apps/mobile/lib/api.ts` - 15 errors
- `apps/mobile/lib/analytics.ts` - 3 errors  
- `apps/web/app/api/ai/insights/route.ts` - 6 errors
- `apps/mobile/__tests__/*.test.ts` - 40+ test errors

**Solution:**
```bash
# 1. Fix Supabase type generation
npx supabase gen types typescript --project-id <id> > types/database.ts

# 2. Install missing dependencies
npm install expo-splash-screen @expo/vector-icons

# 3. Fix type assertions
# Replace unsafe ! operators with proper type guards
```

### 3. **BROKEN MOBILE APP CONFIGURATION - 🚨 IMMEDIATE**

#### Issue: NativeWind v4 Compatibility Problems
- **Error**: `Module 'nativewind' has no exported member 'NativeWindStyleSheet'`
- **Impact**: Mobile app won't compile

**Solution:**
```bash
# Update NativeWind configuration
npm install nativewind@^2.0.11
# Update tailwind.config.js for v2 compatibility
```

#### Issue: Expo Notifications API Incompatibility  
- **Error**: Missing properties in `NotificationBehavior` type
- **Impact**: Push notifications broken

**Solution:**
```bash
# Update notification configuration
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,    // Add missing properties
    shouldShowList: true,      // Add missing properties
  }),
});
```

## Major Issues (⚠️ HIGH PRIORITY)

### 4. **DATABASE SCHEMA PROBLEMS**

#### Issue: SQL Syntax Errors in Migration
- **File**: `supabase/migrations/000_init.sql`
- **Errors**: 100+ PostgreSQL syntax errors
- **Impact**: Database migration will fail

**Problems:**
- RLS policy syntax errors
- Function definition errors  
- Trigger creation failures

**Solution:**
```sql
-- Fix RLS policies
CREATE POLICY "Users can view their own mood entries" ON mood_entries
FOR SELECT USING (auth.uid() = user_id);

-- Fix function syntax
CREATE OR REPLACE FUNCTION update_streak()
RETURNS TRIGGER 
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Function body here
    RETURN NEW;
END;
$$;
```

### 5. **OUTDATED DEPENDENCY ISSUES**

#### Issue: Deprecated API Usage
- **Zod deprecated methods**: 22 warnings across validation files
- **Expo deprecated APIs**: MediaTypeOptions, Subscription
- **Impact**: Future compatibility problems

**Solution:**
```typescript
// Update Zod validation
// OLD: z.string().uuid()
// NEW: z.string().uuid({ message: "Invalid UUID" })

// Update Expo APIs
import { ImagePickerOptions } from 'expo-image-picker';
// Instead of MediaTypeOptions.Images
```

### 6. **CHUNK LOADING ERRORS - FIXED BUT NEEDS MONITORING**

#### Issue: Next.js 15 + React 19 Compatibility
- **Status**: Partially resolved by downgrading to React 18
- **Remaining Risk**: Need to monitor for hydration issues

**Current Fix Applied:**
- Downgraded React 19.1.0 → 18.3.1
- Downgraded Next.js 15.5.0 → 15.0.3
- Added SSR-safe ThemeProvider wrapper

## Medium Priority Issues (📋 MEDIUM PRIORITY)

### 7. **CODE QUALITY ISSUES**

#### Issue: 100+ Console.log Statements in Production Code
**Impact**: Performance degradation, potential data leaks

**Files Affected:**
- All components and API routes contain console.log statements
- Analytics and error handling functions

**Solution:**
```typescript
// Replace with proper logging
import winston from 'winston';
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});
```

### 8. **UNUSED VARIABLES AND IMPORTS**

#### Issue: 40+ Unused Variables/Imports
**Impact**: Bloated bundle size, maintenance confusion

**Examples:**
```typescript
// Remove unused imports
import { Camera, Mic, Plus } from 'lucide-react'; // All unused
const [editingFood, setEditingFood] = useState(null); // Unused state
```

### 9. **TEST SUITE FAILURES**

#### Issue: Test Infrastructure Broken
- **Mock setup errors**: API calls not properly mocked
- **Type mismatches**: Test expectations don't match implementation
- **Missing test dependencies**

**Solution:**
```typescript
// Fix test mocks
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    })),
  },
}));
```

## Low Priority Issues (📝 LOW PRIORITY)

### 10. **CSS WARNINGS**
- **Issue**: Unknown `@tailwind` and `@apply` directives
- **Impact**: IDE warnings, no functional impact
- **Solution**: Update VS Code CSS language server settings

### 11. **ACCESSIBILITY IMPROVEMENTS**
- Missing ARIA labels
- Insufficient color contrast ratios
- Keyboard navigation gaps

### 12. **PERFORMANCE OPTIMIZATIONS**
- Large bundle sizes
- Unoptimized images
- Missing lazy loading

## Comprehensive Action Plan

### Phase 1: Security & Critical Fixes (Days 1-2)
1. **🚨 IMMEDIATE**: Revoke and rotate all exposed API keys
2. **🚨 IMMEDIATE**: Fix TypeScript compilation errors
3. **🚨 IMMEDIATE**: Resolve mobile app configuration issues
4. **🚨 IMMEDIATE**: Fix database migration SQL syntax

### Phase 2: Core Functionality (Days 3-5)
1. Update deprecated API usage
2. Implement proper error boundaries
3. Fix test suite infrastructure
4. Remove console.log statements and implement proper logging

### Phase 3: Code Quality (Days 6-8)
1. Remove unused variables and imports
2. Optimize bundle size
3. Implement proper error handling patterns
4. Add missing type definitions

### Phase 4: Polish & Performance (Days 9-10)
1. Address accessibility issues
2. Optimize performance bottlenecks
3. Implement proper monitoring
4. Complete documentation

## Estimated Timeline

| Phase | Duration | Critical Path Items |
|-------|----------|-------------------|
| Phase 1 | 2 days | Security fixes, compilation errors |
| Phase 2 | 3 days | Core functionality, testing |
| Phase 3 | 3 days | Code quality, optimization |
| Phase 4 | 2 days | Polish, performance |
| **Total** | **10 days** | **Before production deployment** |

## Risk Assessment

### High Risk (Production Blockers)
- ❌ **Exposed API Keys**: Immediate security threat
- ❌ **TypeScript Errors**: Prevents compilation
- ❌ **Database Migration**: Prevents deployment

### Medium Risk (Functionality Issues)  
- ⚠️ **Mobile App Config**: Affects user experience
- ⚠️ **Test Failures**: Reduces confidence
- ⚠️ **Deprecated APIs**: Future compatibility

### Low Risk (Quality Issues)
- 📋 **Console Logging**: Performance impact
- 📋 **Unused Code**: Maintenance overhead
- 📋 **CSS Warnings**: Developer experience

## Specific Fix Commands

### Security Fixes
```bash
# 1. Remove sensitive files from git history
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch apps/web/.env.local' --prune-empty --tag-name-filter cat -- --all

# 2. Update .gitignore
echo -e "\n# Environment files\n.env.local\n.env*.local\n**/.env.local" >> .gitignore

# 3. Force push (DANGER - coordinate with team)
git push origin --force --all
```

### TypeScript Fixes
```bash
# 1. Regenerate database types
cd supabase && npx supabase gen types typescript --project-id YOUR_PROJECT_ID > ../apps/web/lib/types/database.ts

# 2. Install missing dependencies  
cd apps/mobile && npm install expo-splash-screen @expo/vector-icons

# 3. Fix NativeWind version
npm install nativewind@^2.0.11
```

### Database Migration Fixes
```sql
-- Replace the problematic migration with corrected SQL
-- See supabase/migrations/000_init_fixed.sql for full corrected version
```

## Success Metrics

### Before Fixes
- ❌ 264+ TypeScript/ESLint errors
- ❌ 0% successful build rate
- ❌ Critical security vulnerabilities
- ❌ Broken mobile app compilation

### After Fixes (Target)
- ✅ 0 TypeScript compilation errors
- ✅ 100% successful build rate  
- ✅ No exposed secrets in repository
- ✅ All tests passing
- ✅ Mobile and web apps fully functional

## Dependencies for Success

### Required Access
- Admin access to Supabase project
- Access to rotate OpenAI/Gemini API keys
- Repository admin access for git history cleanup

### Required Tools
- Node.js 18+, npm/pnpm
- Supabase CLI
- Git CLI access
- IDE with TypeScript support

### Team Coordination
- Coordinate git history rewrite with all team members
- Notify of API key rotation schedule
- Plan deployment window for fixes

---

**Status**: 🚨 **CRITICAL - IMMEDIATE ACTION REQUIRED**  
**Next Review**: After Phase 1 completion (2 days)  
**Owner**: Development Team  
**Priority**: P0 - Production Blocker