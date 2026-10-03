alter table public.leads add column if not exists phone_extension text check (char_length(phone_extension) <= 10);
