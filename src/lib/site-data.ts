import { ClipboardCheck, Droplets, Gauge, ShieldCheck, Truck, Wrench } from "lucide-react";

export const business = {
  name: "ClearFlow Septic",
  phone: "(555) 014-7742",
  phoneHref: "tel:+15550147742",
  email: "hello@clearflowseptic.example",
  area: "Clearwater County & surrounding communities",
  hours: "Mon–Sat, 7:00 AM–7:00 PM",
};

export const services = [
  { title: "Septic pumping", description: "Thorough tank pumping with a clean, careful property setup and clear service notes.", icon: Truck },
  { title: "Tank inspections", description: "Camera-assisted checks for home sales, maintenance planning, and peace of mind.", icon: ClipboardCheck },
  { title: "System cleaning", description: "Targeted cleaning for tanks, lines, filters, and components that need attention.", icon: Droplets },
  { title: "Repairs & risers", description: "Practical repair options explained in plain language before work begins.", icon: Wrench },
  { title: "Maintenance plans", description: "Proactive reminders and recurring care designed around your household.", icon: Gauge },
  { title: "Urgent response", description: "Fast guidance for backups, alarms, odors, and other time-sensitive concerns.", icon: ShieldCheck },
];

export const serviceNames = services.map((service) => service.title);

export const reviews = [
  { quote: "Clear communication, careful work, and no surprise mess. The whole visit felt professional.", name: "Dana M.", location: "Clearwater" },
  { quote: "They explained what they found and what could wait. That honesty earned our trust.", name: "Marcus T.", location: "Northfield" },
  { quote: "Booking was simple and the crew arrived exactly when promised. We'll call ClearFlow again.", name: "Priya S.", location: "Lakeside" },
];