# Musikana Foundation Wish List

A donation registry where donors pledge items themselves. Counts update for everyone. Each item has a goal, but goals are targets, not limits, so donors can give more.

- **Public page** (`/`): two-step pledging. Step 1: donors choose items and quantities from the wish list. Step 2: they enter their name and contact details (phone/WhatsApp and/or email) and confirm. They get a thank-you screen with a reference number, and you get in touch to arrange drop-off.
- **Admin site**: a separate, password-protected site. Edit visit details, add and edit items, track received items, manage pledges and download them as a CSV.

Stack: Node + Express, Postgres on Neon, plain HTML/CSS/JS (no build step).

## 1. Set up the database on Neon
1. Create a project at neon.tech.
2. Copy the connection string (Dashboard > Connect). It ends in `?sslmode=require`. Keep that part.
3. That's it. The tables are created automatically the first time the server starts (`schema.sql`).

## 2. Put the code on GitHub
Create a new repository and push this folder to it. `.env` and `node_modules` are already ignored.

## 3. Deploy on Render: two separate sites
The donor wish list and the admin dashboard run as **two separate Render services** from this one repository. They share the same Neon database, so pledges made on the public site appear on the admin site straight away. The public site has no admin page or admin API at all, so there is nothing to find there.

**Easiest: use the Blueprint (`render.yaml`)**
1. In Render: New > **Blueprint** > connect the GitHub repository.
2. Render creates both services. When prompted, fill in:
   - `DATABASE_URL` (both services): your Neon connection string
   - `ADMIN_PASSWORD` (admin service): a long password only you know
   - `PUBLIC_URL` (admin service): the public site's address, e.g. `https://musikana-wishlist.onrender.com` (you can add this after the first deploy)
3. Share only the public site's link. Keep the admin link to yourself and bookmark it.

**Or by hand:** create two Web Services from the same repo (build `npm install`, start `npm start`). Set `APP_MODE=public` on one and `APP_MODE=admin` on the other, plus the variables above.

Note: on Render's free plan each service sleeps when idle, so the first visit after a quiet spell can take up to a minute.

## 4. Before sharing the link
1. Open the admin site and sign in.
2. Fill in visit details: date, drop-off point, deadline, WhatsApp number and cash donation details.
3. Load the Rose of Charity list: open the Neon SQL Editor, paste in `seed-rose-of-charity.sql` and run it. (Or add items one by one on the admin page.) Adjust goals in admin any time.
4. Open the public page and test a pledge, then delete the test pledge in admin.

## Updating an existing deployment
If you deployed the earlier version, just redeploy. The server adds the new `email` and `ref` columns on start, and existing pledges keep working.

## Running locally
```
cp .env.example .env      # then fill in the values
npm install
node --env-file=.env server.js
```
With `APP_MODE=all`, open http://localhost:3000 (wish list) and http://localhost:3000/admin (admin).

## Targets by weight or volume
Each item has a **measure**: kg, litres, packs, units, or **choose only** (donors just tick it, with no amount, e.g. clothes and toys). For kg/litre items, the target is a weight or volume (e.g. 100 kg of rice) and **size** says how much one unit holds (2 for a 2kg pack). Donors still pledge in units, and the page converts for them ("3 packs = 6 kg"). Target 0 means no target.

## Received vs pledged tracker
The admin page opens with a tracker showing, for every item, how much is pledged, how much has been received, and what is still to collect. Received = pledges you mark as **received** + any **extra received** you enter on an item for donations that arrive without a pledge.

## Email alert for every pledge
Every new pledge sends an email to **charity@irenemusengi.co.zw**, the same way a website contact form does. It uses **FormSubmit** (formsubmit.co): free, no account, no API key. The email arrives as a neat table with the donor's name, phone, email, reference, what they pledged and a link to the admin site. Hitting **Reply** answers the donor directly (when they gave an email).

Set up (2 minutes, once the public site is live on Render):
1. Make a **test pledge** on the public site.
2. FormSubmit sends a one-time **activation email** to charity@irenemusengi.co.zw (check spam). Click **Activate Form**. The test pledge, and every pledge after it, is then delivered.
3. Optional: in Render, set `ADMIN_URL` on the public service to your admin site's address, so each email links to it.
4. Optional: the activation email includes a random-string alias. You can put it in `FORMSUBMIT_ALIAS`, but since emails are sent from the server, your address never appears on the website anyway.

The email is sent after the pledge is saved. If email ever fails, the donor isn't affected and the pledge is still on the admin site; the error shows in Render's logs.

Alternative: set `RESEND_API_KEY` to send through Resend instead.

## Privacy
- Donor phone numbers and emails are only shown on the admin page and in the CSV, never on the public page.
- Each pledge needs at least a phone number or an email address.
- Donors choose whether their name appears on the thank-you list.
- Cancelled pledges free up the quantity again.
