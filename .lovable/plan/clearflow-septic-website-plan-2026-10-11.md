# ClearFlow Septic website plan

## Brand direction
- Build a polished local-service brand called **ClearFlow Septic** with invented, clearly replaceable business details.
- Use the selected Clean & Trusted palette: deep navy `#0C2340`, service blue `#1A4A6E`, teal `#2D8A9E`, and clean white `#F7FAFC`.
- Use **Bebas Neue** for strong display headings and **Barlow** for readable body copy.
- Create a confident service-showcase layout with real septic-service imagery, crisp iconography, restrained motion, and prominent trust signals.

## Six-page website
1. **Home** — full-width branded service photo, urgent call and booking actions, services overview, trust metrics, process, reviews, and service-area prompt.
2. **Services** — septic pumping, inspections, tank cleaning, repairs, maintenance, and emergency response with clear expectations.
3. **About** — local-company story, safety and workmanship standards, team presentation, equipment, and customer-first values.
4. **Book Service** — multi-step booking experience with service selection, address/contact details, date and time calendar, summary, and confirmation state.
5. **AI Receptionist** — a polished chat-style receptionist that answers common questions, gathers job details, identifies urgency, and hands users into booking.
6. **Contact** — phone, email, hours, service-area information, inquiry form, and emergency callout.

## Shared customer experience
- Add a responsive header, compact mobile menu, persistent “Book service” action, and complete footer across all pages.
- Create an instant quote/intake panel for property type, service need, and tank details; label estimates as preliminary rather than presenting invented fixed prices.
- Make all forms and controls usable with keyboard and screen readers, with clear success, empty, loading, and validation states.
- Use invented copy, testimonials, contact details, hours, certifications, and service areas as obvious demo content to replace before launch.

## Booking and AI receptionist
- Activate Lovable Cloud for saved appointments, contact requests, and AI receptionist conversations.
- Store appointment requests and prevent unavailable time choices in the booking calendar.
- Connect the receptionist to the website’s service and policy information, let it collect a concise customer intake, and route users to a prefilled booking flow.
- Keep emergency messaging prominent and direct urgent hazards to the business phone rather than relying on chat.

## Technical details
- Implement the six pages as separate TanStack routes with unique titles, descriptions, Open Graph metadata, and working internal navigation.
- Define all colors, typography, surfaces, shadows, and interaction states as semantic design tokens; support both desktop and mobile layouts.
- Generate a cohesive set of original septic-service images and store them with the project rather than linking to external stock images.
- Add focused tests for route coverage and core booking behavior, then verify the complete booking and receptionist flows in the live preview at desktop and mobile sizes.
