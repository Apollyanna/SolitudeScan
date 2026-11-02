-- ============================================================
-- SolitudeScan — COLE TUDO ISTO NO SQL EDITOR DO SUPABASE
-- (um clique em RUN no final)
-- Nao apaga nada que voce ja tenha. So adiciona obras de teste.
-- ============================================================

insert into public.works (
  id, title, slug, cover_url, author, artist, status, type, synopsis,
  views, likes_count, rating_avg, rating_count,
  is_featured, is_vip, is_adult, is_published, updated_at, created_at
) values
(
  'a1000000-0000-4000-8000-000000000001',
  'Sombras do Eclipse',
  'sombras-do-eclipse',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Sombras+do+Eclipse',
  'Kim Hyeon', 'Park Min', 'Em Lancamento', 'Manhwa',
  'Em um mundo onde o sol desapareceu, um jovem descobre que carrega o ultimo fragmento de luz.',
  12840, 892, 4.70, 210, true, false, false, true,
  now() - interval '2 hours', now() - interval '30 days'
),
(
  'a1000000-0000-4000-8000-000000000002',
  'Coracao de Aco',
  'coracao-de-aco',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Coracao+de+Aco',
  'Lee Soo-jin', 'Lee Soo-jin', 'Em Lancamento', 'Manhwa',
  'Apos perder tudo em uma guerra cibernetica, uma mercenaria digital recebe um corpo mecanico.',
  9450, 670, 4.50, 155, true, false, false, true,
  now() - interval '5 hours', now() - interval '20 days'
),
(
  'a1000000-0000-4000-8000-000000000003',
  'Flor de Inverno',
  'flor-de-inverno',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Flor+de+Inverno',
  'Han Yuna', 'Choi Ji-eun', 'Completo', 'Manhwa',
  'Uma herdeira de uma familia tradicional se apaixona por um artista de rua.',
  22100, 1540, 4.90, 420, true, false, false, true,
  now() - interval '1 day', now() - interval '60 days'
),
(
  'a1000000-0000-4000-8000-000000000004',
  'Reino das Cinzas',
  'reino-das-cinzas',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Reino+das+Cinzas',
  'Jung Tae', 'Jung Tae', 'Em Lancamento', 'Manhwa',
  'O imperio caiu. Restaram apenas cinzas e um principe que nao queria o trono.',
  18700, 1100, 4.60, 280, false, true, false, true,
  now() - interval '3 hours', now() - interval '15 days'
),
(
  'a1000000-0000-4000-8000-000000000005',
  'Noite Infinita',
  'noite-infinita',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Noite+Infinita',
  'Sato Aya', 'Sato Aya', 'Hiato', 'Manga',
  'Uma estudante transferida descobre que sua nova cidade nunca amanhece.',
  6300, 410, 4.30, 98, false, false, false, true,
  now() - interval '7 days', now() - interval '40 days'
),
(
  'a1000000-0000-4000-8000-000000000006',
  'Velocidade Maxima',
  'velocidade-maxima',
  'https://placehold.co/300x450/1a0f1e/ec4899?text=Velocidade+Maxima',
  'Ryo Takahashi', 'Ryo Takahashi', 'Em Lancamento', 'Manga',
  'Em corridas ilegais nas montanhas de Toquio, um piloto amador desafia o rei das ruas.',
  11200, 780, 4.40, 190, false, false, false, true,
  now() - interval '12 hours', now() - interval '10 days'
)
on conflict (id) do update set
  title = excluded.title,
  cover_url = excluded.cover_url,
  synopsis = excluded.synopsis,
  is_published = true,
  updated_at = excluded.updated_at;

insert into public.work_genres (work_id, genre_id) values
  ('a1000000-0000-4000-8000-000000000001', '11443bd1-a77a-492b-9c7e-9fc071865dec'),
  ('a1000000-0000-4000-8000-000000000001', 'a89050e9-df3a-40af-afb0-e9968da26296'),
  ('a1000000-0000-4000-8000-000000000001', '5c6cc0e1-7821-497b-919a-aedbf1341766'),
  ('a1000000-0000-4000-8000-000000000002', '11443bd1-a77a-492b-9c7e-9fc071865dec'),
  ('a1000000-0000-4000-8000-000000000002', 'ae672248-968c-4035-8f88-a5a8431358b9'),
  ('a1000000-0000-4000-8000-000000000002', '4e27993f-2123-4c38-b10b-7d121588f8e5'),
  ('a1000000-0000-4000-8000-000000000003', 'c4efd3c0-c81d-4cc1-a7a5-b1873914400b'),
  ('a1000000-0000-4000-8000-000000000003', '4e27993f-2123-4c38-b10b-7d121588f8e5'),
  ('a1000000-0000-4000-8000-000000000003', 'a6e49e59-4285-459c-abca-e8a564f17d24'),
  ('a1000000-0000-4000-8000-000000000004', '11443bd1-a77a-492b-9c7e-9fc071865dec'),
  ('a1000000-0000-4000-8000-000000000004', 'a89050e9-df3a-40af-afb0-e9968da26296'),
  ('a1000000-0000-4000-8000-000000000004', '5c6cc0e1-7821-497b-919a-aedbf1341766'),
  ('a1000000-0000-4000-8000-000000000005', 'ea49618c-cd36-49fb-8594-a87270743e22'),
  ('a1000000-0000-4000-8000-000000000005', 'b134b118-9a58-4a55-a232-988a514157dc'),
  ('a1000000-0000-4000-8000-000000000005', 'd514b7fb-c029-4ca6-b6fb-040c6d693f3b'),
  ('a1000000-0000-4000-8000-000000000006', '11443bd1-a77a-492b-9c7e-9fc071865dec'),
  ('a1000000-0000-4000-8000-000000000006', '079db710-f12d-4a98-9284-232cf696c535'),
  ('a1000000-0000-4000-8000-000000000006', '4e27993f-2123-4c38-b10b-7d121588f8e5')
on conflict do nothing;

insert into public.chapters (work_id, chapter_number, title, is_published, is_vip, published_at, created_at)
select
  w.id,
  n,
  'Capitulo ' || n,
  true,
  (n >= 4 and w.slug = 'reino-das-cinzas'),
  now() - ((6 - n) || ' hours')::interval,
  now() - ((6 - n) || ' hours')::interval
from public.works w
cross join generate_series(1, 5) as n
where w.id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000006'
)
on conflict (work_id, chapter_number) do nothing;

update public.profiles
set is_admin = true, role = 'admin'
where email ilike '%isabella%' or email ilike '%solitude%'
   or id = 'd4618bc4-518d-472a-99e0-647520435092';

select
  (select count(*) from public.works where is_published = true) as obras_publicadas,
  (select count(*) from public.chapters) as capitulos,
  (select count(*) from public.profiles where is_admin = true) as admins;
