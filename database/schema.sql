-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users (Supabase auth handles this, but here's the profile table)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text unique not null,
  created_at timestamp with time zone default now()
);

-- Bank accounts
create table public.accounts (
  bank_acc_id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(profile_id) on delete cascade not null,
  account_name text,
  account_type text check (account_type in ('checking', 'savings', 'credit', 'investment')),
  last_four text,
  created_at timestamp with time zone default now(),
  unique(user_id, last_four)
);

-- Uploaded PDF statements
create table public.statements (
  statements_id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(profile_id) on delete cascade not null,
  account_id uuid references public.accounts(bank_acc_id) on delete cascade not null,
  filename text not null,
  file_hash text unique not null,
  storage_path text not null,
  period_start date,
  period_end date,
  uploaded_at timestamp with time zone default now()
);

-- Transactions
create table public.transactions (
  id uuid default gen_random_uuid() primary key,
  statement_id uuid references public.statements(statements_id) on delete cascade not null,
  user_id uuid references public.profiles(profile_id) on delete cascade not null,
  date date not null,
  description text not null,
  amount numeric(12, 2) not null,
  type text check (type in ('debit', 'credit')) not null,
  category text,
  created_at timestamp with time zone default now()
);

-- Shared merchant category cache
create table public.merchant_categories (
  description text primary key,
  category text not null,
  created_at timestamp with time zone default now()
);

create table user_category_overrides (
  user_id             uuid not null,
  cleaned_description text not null,
  category            text not null,
  primary key (user_id, cleaned_description)
);

alter table user_category_overrides enable row level security;

create policy "own overrides only"
  on user_category_overrides
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Row Level Security
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.statements enable row level security;
alter table public.transactions enable row level security;

create policy "Users see own profile" on public.profiles for all using (auth.uid() = profile_id);
create policy "Users see own accounts" on public.accounts for all using (auth.uid() = user_id);
create policy "Users see own statements" on public.statements for all using (auth.uid() = user_id);
create policy "Users see own transactions" on public.transactions for all using (auth.uid() = user_id);

alter table public.merchant_categories enable row level security;
create policy "Anyone can read merchant categories" on public.merchant_categories
  for select using (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (profile_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


create table user_category_overrides (
  user_id             uuid not null,
  cleaned_description text not null,
  category            text not null,
  primary key (user_id, cleaned_description)
);