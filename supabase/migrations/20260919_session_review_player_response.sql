-- Add one concise session-level rating for player response.
-- Existing historical reviews remain valid with player_response = null.

alter table public.training_session_reviews
add column if not exists player_response integer
  check (player_response is null or player_response between 1 and 5);
