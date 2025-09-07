-- Add realistic macro data to existing food entries
-- This simulates what the AI/nutrition APIs should be doing automatically

-- Add macros to breakfast entries
UPDATE food_entries 
SET macros = jsonb_build_object(
    'protein', 20,
    'carbs', 45, 
    'fat', 12
)
WHERE user_id = auth.uid() 
AND macros IS NULL 
AND meal = 'breakfast';

-- Add macros to lunch entries  
UPDATE food_entries 
SET macros = jsonb_build_object(
    'protein', 35,
    'carbs', 30,
    'fat', 22
)
WHERE user_id = auth.uid() 
AND macros IS NULL 
AND meal = 'lunch';

-- Add macros to dinner entries
UPDATE food_entries 
SET macros = jsonb_build_object(
    'protein', 28,
    'carbs', 40,
    'fat', 18
)
WHERE user_id = auth.uid() 
AND macros IS NULL 
AND meal = 'dinner';

-- Add macros to snack entries
UPDATE food_entries 
SET macros = jsonb_build_object(
    'protein', 8,
    'carbs', 25,
    'fat', 15
)
WHERE user_id = auth.uid() 
AND macros IS NULL 
AND meal = 'snack';

-- Show results
SELECT 'Macro data added!' AS result;
SELECT COUNT(*) as entries_updated 
FROM food_entries 
WHERE user_id = auth.uid() 
AND macros IS NOT NULL;