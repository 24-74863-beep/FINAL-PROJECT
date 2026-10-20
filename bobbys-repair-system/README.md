# Bobby's Motorcycle Repair Management System

HTML + CSS + JavaScript. No server or installation needed.

## How to run
1. Unzip the folder.
2. Double-click `index.html` (Chrome, Edge or Firefox).

## Default logins (change after first login)
| Role     | Username    | Password   |
|----------|-------------|------------|
| Owner    | `owner`     | `owner123` |
| Mechanic | `mechanic1` | `mech123`  |
| Customer | Sign up on the login page (Customer Sign Up tab) |

Owner > Backup & Data > "Load sample data" adds demo records (customer logins `juan` / `maria`, password `customer123`).

## Database
Data is stored as JSON tables in the browser (localStorage) on the same computer/browser:
users, customers, motorcycles, services, parts, repairs, emergencies, payments.
Passwords are stored as SHA-256 hashes. Use **Backup & Data > Download backup** regularly (BRD risk: data loss).

## Features per role
- **Owner**: dashboard, repairs, emergency requests, customers, motorcycles, services & parts (stock), payments, reports (repairs/services/payments/emergency; print + CSV), accounts for owner/mechanics/customers, backup/restore.
- **Mechanic**: dashboard, assigned + unassigned repair jobs, record services/parts, update repair status, emergency requests, customers & motorcycles.
- **Customer**: own motorcycles, own repair status/services/parts/payment details and history, emergency service request.

## Files
- `index.html` + `js/auth.js` - login and customer sign-up
- `app.html` + `js/app.js` - main system
- `js/db.js` - database and authentication layer
- `css/style.css` - styling
