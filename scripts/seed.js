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

  // A second demo route so multi-route behavior works out of the box.
  const { rows: [route2] } = await pool.query(
    `insert into routes (name) values ($1) returning id`,
    ['Airport Express']
  );
  const STOPS2 = [
    ['Campus Gate', 14.6937, -17.4441],
    ['Stadium', 14.6862, -17.4553],
    ['Airport', 14.6772, -17.4909],
  ];
  for (let i = 0; i < STOPS2.length; i++) {
    await pool.query(
      `insert into stops (route_id, position, name, lat, lng) values ($1, $2, $3, $4, $5)`,
      [route2.id, i, ...STOPS2[i]]
    );
  }
  for (const time of ['08:00', '13:00', '19:00']) {
    await pool.query(`insert into departures (route_id, departs_at) values ($1, $2)`, [route2.id, time]);
  }
  await pool.query(`insert into announcements (route_id, message) values ($1, '')`, [route2.id]);
  const pinHash2 = await bcrypt.hash('5678', 10);
  await pool.query(
    `insert into buses (route_id, label, driver_name, pin_hash) values ($1, $2, $3, $4)`,
    [route2.id, 'Navette A', 'Moussa Sy', pinHash2]
  );

  const adminPassword = randomPassword();
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `insert into admins (username, password_hash) values ($1, $2)`,
    ['admin', passwordHash]
  );

  console.log('Seed complete.');
  console.log(`Route: SunuShuttle Main Line (${STOPS.length} stops, demo coordinates)`);
  console.log(`Route: Airport Express (${STOPS2.length} stops, demo coordinates)`);
  console.log(`Demo driver PINs: ${DEMO_DRIVER_PIN} (Main Line), 5678 (Airport Express)`);
  console.log(`Admin username: admin`);
  console.log(`Admin password: ${adminPassword}`);
  console.log('Store the admin password now, it will not be shown again. Update stop coordinates for your real route from the admin panel.');
} finally {
  await pool.end();
}
