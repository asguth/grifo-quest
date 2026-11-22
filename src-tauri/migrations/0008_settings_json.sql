-- Pomodoro passa a ser um JSON tipado numa chave só, como `config` e `profile`.
INSERT INTO settings (key, value)
SELECT 'pomodoro', json_object(
    'focus_min', CAST(COALESCE((SELECT value FROM settings WHERE key = 'pomodoro_focus_min'), '25') AS INTEGER),
    'break_min', CAST(COALESCE((SELECT value FROM settings WHERE key = 'pomodoro_break_min'), '5') AS INTEGER))
WHERE EXISTS (SELECT 1 FROM settings WHERE key IN ('pomodoro_focus_min', 'pomodoro_break_min'))
ON CONFLICT(key) DO NOTHING;

DELETE FROM settings WHERE key IN ('pomodoro_focus_min', 'pomodoro_break_min');
