update public.settings
set game_categories = array['Mobile Legends', 'Clash of Clans']
where game_categories is null
   or game_categories = '{}'
   or game_categories @> array['PUBG', 'Free Fire', 'Valorant', 'COD Mobile'];
