-- Check existing macros data and add some if missing
-- Run this in Supabase SQL Editor

-- Check what macros data currently exists
SELECT 'Current macros data:' AS info;
SELECT date, meal, food_labels, calories, macros, COALESCE(macros::text, 'NULL') as macros_text
FROM food_entries 
WHERE user_id = auth.uid()
ORDER BY date DESC 
LIMIT 5;

-- Count entries with and without macros
SELECT 
    COUNT(*) as total_entries,
    COUNT(macros) as entries_with_macros,
    COUNT(*) - COUNT(macros) as entries_without_macros
FROM food_entries 
WHERE user_id = auth.uid();

-- If you want to add sample macros data to existing entries (optional)
-- Uncomment the lines below to add realistic macros to your existing food entries

-- UPDATE food_entries 
-- SET macros = '{"protein": 20, "carbs": 40, "fat": 15}'::jsonb
-- WHERE user_id = auth.uid() 
-- AND macros IS NULL 
-- AND meal = 'breakfast';

-- UPDATE food_entries 
-- SET macros = '{"protein": 30, "carbs": 35, "fat": 25}'::jsonb
-- WHERE user_id = auth.uid() 
-- AND macros IS NULL 
-- AND meal = 'lunch';

-- UPDATE food_entries 
-- SET macros = '{"protein": 25, "carbs": 45, "fat": 20}'::jsonb
-- WHERE user_id = auth.uid() 
-- AND macros IS NULL 
-- AND meal = 'dinner';

-- UPDATE food_entries 
-- SET macros = '{"protein": 5, "carbs": 20, "fat": 10}'::jsonb
-- WHERE user_id = auth.uid() 
-- AND macros IS NULL 
-- AND meal = 'snack';

SELECT 'Run completed - check macro distribution on insights page!' AS result;