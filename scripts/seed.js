import { Pool } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

const STOPS = ['Campus Gate', 'Market Junction', 'Roundabout', 'Town Terminal'];
const DEPARTURES = ['18:15', '20:30'];
const DEMO_DRIVER_PIN = '1234';

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

try {
  const { rows: existing } = await pool.query('select id from routes limit 1');
  if (existing.length) {
    console.log('Seed skipped: a route already exists.');
    process.exit(0);
  }

  const { rows: [route] } = await pool.query(
    `insert into routes (name) values ($1) returning id`,
    ['SunuShuttle Main Line']
  );

  for (let i = 0; i < STOPS.length; i++) {
    await pool.query(
      `insert into stops (route_id, position, name, lat, lng) values ($1, $2, $3, $4, $5)`,
      [route.id, i, STOPS[i], 14.6937 + i * 0.01, -17.4441 + i * 0.01]
    );
  }

  for (const time of DEPARTURES) {
    await pool.query(
      `insert into departures (route_id, departs_at) values ($1, $2)`,
      [route.id, time]
    );
  }

  await pool.query(
    `insert into announcements (route_id, message) values ($1, '')`,
    [route.id]
  );

  const pinHash = await bcrypt.hash(DEMO_DRIVER_PIN, 10);
  await pool.query(
    `insert into buses (route_id, label, driver_name, pin_hash) values ($1, $2, $3, $4)`,
    [route.id, 'Bus 1', 'Demo Driver', pinHash]
  );

  const adminPassword = randomPassword();
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `insert into admins (username, password_hash) values ($1, $2)`,
    ['admin', passwordHash]
  );

  console.log('Seed complete.');
  console.log(`Route: SunuShuttle Main Line (${STOPS.length} stops, demo coordinates)`);
  console.log(`Demo driver PIN: ${DEMO_DRIVER_PIN}`);
  console.log(`Admin username: admin`);
  console.log(`Admin password: ${adminPassword}`);
  console.log('Store the admin password now, it will not be shown again. Update stop coordinates for your real route from the admin panel.');
} finally {
  await pool.end();
}
