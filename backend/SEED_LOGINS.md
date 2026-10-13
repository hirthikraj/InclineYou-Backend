# Seed logins

Phone numbers for the data created by `scripts/seed-three-months.sh` (development only).
Sign in on the web app with the phone; the OTP is printed in the backend log (`OTP_DELIVERY=log`).

## Trainer

| Name | Phone | Notes |
| --- | --- | --- |
| Hirthikraj R | `+919840137911` (type `9840137911`) | 14 clients, 13 weeks of diary, money book, assessments. Re-seed with `./scripts/seed-three-months.sh 9840137911` |

## Sample clients (client portal)

| Name | Phone | What you see |
| --- | --- | --- |
| Meera Iyer | `+919884010101` | Fully active portal: plan, sessions, recaps, bell, shared note, solo Sunday workouts, monthly assessments, money |
| Divya Menon | `+919884010107` | Online client with a weekly check-in waiting today and a full bell (WhatsApp reminders) |
| Anjali Rao | `+919884010114` | Paused by the trainer: signs in to the "paused" wall only |

Other portal numbers: Vikram `+919884010102`, Priya `+919884010103`, Sneha `+919884010104`, Karthik `+919884010106`, Rohan `+919884010108`, Suresh `+919884010110`; Farhan `+919884010115` (left, "removed" wall).

Arjun Reddy (`+919884010105`) has a live invite instead of an account: open `/invite/vFv4pZ5bm8OMXoh42ghZBbXymhmzvTqVGp2YLJL0oGI` on the web app.

Re-running the seed deletes the clients' sign-ins and sessions, so sign in again afterwards.
