-- Add sample data to test the insights page
-- Run this AFTER creating tables and AFTER logging in to get your user ID

-- First, let's see your user ID
SELECT 'Your user ID is: ' || auth.uid()::text AS user_info;

-- Add sample mood entries for the past week
INSERT INTO mood_entries (user_id, date, mood_score, note) VALUES
(auth.uid(), CURRENT_DATE, 4, 'Feeling good today'),
(auth.uid(), CURRENT_DATE - 1, 3, 'Okay day'),
(auth.uid(), CURRENT_DATE - 2, 5, 'Great day!'),
(auth.uid(), CURRENT_DATE - 3, 3, 'Average day'),
(auth.uid(), CURRENT_DATE - 4, 4, 'Pretty good'),
(auth.uid(), CURRENT_DATE - 5, 2, 'Not great'),
(auth.uid(), CURRENT_DATE - 6, 4, 'Good morning')
ON CONFLICT (user_id, date) DO NOTHING;

-- Add sample food entries for the past week
INSERT INTO food_entries (user_id, date, meal, food_labels, calories, macros) VALUES
(auth.uid(), CURRENT_DATE, 'breakfast', ARRAY['Oatmeal', 'Banana', 'Milk'], 350, '{"protein": 12, "carbs": 45, "fat": 8}'),
(auth.uid(), CURRENT_DATE, 'lunch', ARRAY['Chicken Salad', 'Avocado'], 450, '{"protein": 35, "carbs": 15, "fat": 28}'),
(auth.uid(), CURRENT_DATE - 1, 'breakfast', ARRAY['Eggs', 'Toast', 'Orange Juice'], 400, '{"protein": 18, "carbs": 35, "fat": 12}'),
(auth.uid(), CURRENT_DATE - 1, 'dinner', ARRAY['Salmon', 'Rice', 'Broccoli'], 550, '{"protein": 40, "carbs": 45, "fat": 22}'),
(auth.uid(), CURRENT_DATE - 2, 'breakfast', ARRAY['Yogurt', 'Granola', 'Berries'], 300, '{"protein": 15, "carbs": 30, "fat": 10}'),
(auth.uid(), CURRENT_DATE - 2, 'lunch', ARRAY['Turkey Sandwich', 'Apple'], 420, '{"protein": 25, "carbs": 40, "fat": 15}'),
(auth.uid(), CURRENT_DATE - 3, 'breakfast', ARRAY['Smoothie', 'Protein Powder'], 280, '{"protein": 25, "carbs": 20, "fat": 5}'),
(auth.uid(), CURRENT_DATE - 3, 'dinner', ARRAY['Pasta', 'Chicken', 'Vegetables'], 480, '{"protein": 30, "carbs": 50, "fat": 18}');

SELECT 'Sample data added successfully!' AS result;
SELECT 'Now refresh the insights page to see real data' AS instruction;