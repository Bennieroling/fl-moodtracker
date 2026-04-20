CREATE OR REPLACE FUNCTION recalc_streaks(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_last_entry date;
  v_d date;
  v_cur int := 0;
  v_best int;
BEGIN
  -- Find the most recent day with any entry
  SELECT max(date) INTO v_last_entry
  FROM (
    SELECT date FROM mood_entries WHERE user_id = p_user_id
    UNION ALL
    SELECT date FROM food_entries WHERE user_id = p_user_id
  ) entries;

  -- No entries ever -> reset streak
  IF v_last_entry IS NULL THEN
    INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date)
    VALUES (p_user_id, 0, 0, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET current_streak = 0, updated_at = now();
    RETURN;
  END IF;

  -- If most recent entry is older than yesterday, streak is broken
  IF v_last_entry < current_date - 1 THEN
    v_cur := 0;
  ELSE
    -- Walk backwards from the most recent entry date
    v_d := v_last_entry;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM mood_entries WHERE user_id = p_user_id AND date = v_d
      ) AND NOT EXISTS (
        SELECT 1 FROM food_entries WHERE user_id = p_user_id AND date = v_d
      );
      v_cur := v_cur + 1;
      v_d := v_d - 1;
    END LOOP;
  END IF;

  v_best := COALESCE(
    (SELECT longest_streak FROM streaks WHERE user_id = p_user_id), 0
  );
  IF v_cur > v_best THEN v_best := v_cur; END IF;

  INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date)
  VALUES (p_user_id, v_cur, v_best, v_last_entry)
  ON CONFLICT (user_id) DO UPDATE
    SET current_streak = EXCLUDED.current_streak,
        longest_streak = GREATEST(streaks.longest_streak, EXCLUDED.current_streak),
        last_entry_date = EXCLUDED.last_entry_date,
        updated_at = now();
END $function$;
