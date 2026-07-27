/* eslint-disable no-console */
/**
 * End-to-end manual test for custom-delivery + station images.
 * No Swagger, no shell quoting, no copy/paste newlines — the multipart body is built in code.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/test-custom-order.ts
 *
 * It uploads fresh images each run (so the ids are always valid/unused), then creates an order that
 * attaches them per station, then fetches the order and prints the stations with their images.
 *
 * If the token below is expired, set EMAIL/PASSWORD to a seeded customer and clear TOKEN to ''.
 */
import axios from 'axios';
import * as FormData from 'form-data';

const BASE = process.env.BASE_URL || 'http://localhost:3031/api';

// Paste a fresh customer AccessToken here (or leave '' to auto-login with EMAIL/PASSWORD).
let TOKEN = '';

const EMAIL = 'test.customer@makanak.dev';
const PASSWORD = 'Password@123';

// 1x1 transparent PNG (so we don't need real image files on disk).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const headers = () => ({ Authorization: `Bearer ${TOKEN}`, Locale: 'en' });
const unwrap = (body: any) => body?.data?.data ?? body?.data ?? body;

async function login() {
  const { data } = await axios.post(`${BASE}/authentication/login/Customer`, {
    email: EMAIL,
    password: PASSWORD,
    locale: 'en',
  });
  TOKEN = data?.data?.AccessToken;
  console.log('logged in as user', data?.data?.user?.id);
}

async function uploadImages(count: number): Promise<number[]> {
  const form = new FormData();
  for (let i = 0; i < count; i++) {
    form.append('images', PNG, {
      filename: `img${i}.png`,
      contentType: 'image/png',
    });
  }
  const { data } = await axios.post(
    `${BASE}/orders/custom-delivery/images`,
    form,
    {
      headers: { ...headers(), ...form.getHeaders() },
    },
  );
  const ids = data?.data?.imageIds as number[];
  console.log('uploaded → imageIds:', ids);
  return ids;
}

async function createOrder(stops: any[]) {
  const form = new FormData();

  form.append('stops', JSON.stringify(stops));
  form.append('paymentMethod', 'CASH');
  form.append('paidWithWallet', 'false');
  form.append('estimatedItemsCost', '0');
  form.append('isGift', 'false');
  form.append('tip', '0');
  form.append('itemsDescription', 'test custom delivery order');
  form.append('note', 'test note');
  form.append('driverInstructions', 'test driver instructions');
  form.append('transferNumber', '');

  const { data } = await axios.post(`${BASE}/orders/custom-delivery`, form, {
    headers: { ...headers(), ...form.getHeaders() },
  });

  return unwrap(data);
}

(async () => {
  try {
    if (!TOKEN) await login();

    const ids = await uploadImages(3);

    const stops = [
      {
        lat: 30.0444,
        lng: 31.2357,
        name: 'Workshop',
        estimatedCost: 250,
        imageIds: [ids[0], ids[1]],
      },
      {
        lat: 30.0566,
        lng: 31.2394,
        name: 'Supermarket',
        estimatedCost: 180,
        imageIds: [ids[2]],
      },
      { lat: 30.0626, lng: 31.2497, name: 'Home', label: 'Drop-off' },
    ];

    const order = await createOrder(stops);
    console.log('\n✅ order created, id:', order?.id);

    const { data: getBody } = await axios.get(`${BASE}/orders/${order.id}`, {
      headers: headers(),
    });
    const fetched = unwrap(getBody);
    const view = (fetched?.Stations ?? []).map((s: any) => ({
      sequence: s.sequence,
      name: s.name,
      images: (s.Images ?? []).map((im: any) => ({
        id: im.id,
        image: im.image,
      })),
    }));
    console.log('\nstations + images:');
    console.dir(view, { depth: null });
  } catch (e: any) {
    console.error('\n❌ ERROR DETAILS');

    if (e?.response) {
      console.error('Status:', e.response.status);
      console.error('StatusText:', e.response.statusText);
      console.error('Headers:', e.response.headers);
      console.error('Response:', e.response.data);
    } else {
      console.error('Message:', e?.message);
    }
  }
})();
