-- SunuShuttle schema (Postgres / Neon)
-- One route can have several buses running on it at once, each with its own
-- driver, PIN, live position and trip history.

create extension if not exists pgcrypto;

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  position int not null,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  unique (route_id, position)
);

create table if not exists departures (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  departs_at time not null,
  unique (route_id, departs_at)
);

create table if not exists buses (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  label text not null,
  driver_name text not null,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  boarded_count int not null default 0
);

-- One row per bus, upserted on every GPS ping. Kept separate from trips so a
-- stale row simply disappears once its trip ends.
create table if not exists positions (
  bus_id uuid primary key references buses(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed_kmh double precision not null default 0,
  heading double precision,
  updated_at timestamptz not null default now()
);

create table if not exists announcements (
  route_id uuid primary key references routes(id) on delete cascade,
  message text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null
);

-- Login throttling, keyed by caller IP, so a 4-digit driver PIN cannot be
-- brute forced in a reasonable number of requests.
create table if not exists login_attempts (
  scope text not null,
  identifier text not null,
  attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier)
);

create index if not exists idx_stops_route on stops(route_id, position);
create index if not exists idx_trips_bus on trips(bus_id, started_at desc);
create index if not exists idx_buses_route on buses(route_id);
