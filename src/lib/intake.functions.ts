import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const appointmentSchema = z.object({
  service: z.string().min(2).max(100), propertyType: z.string().min(2).max(60), requestedDate: z.string().date(), requestedTime: z.string().min(2).max(40),
  fullName: z.string().min(2).max(100), email: z.string().email().max(180), phone: z.string().min(7).max(40), address: z.string().min(5).max(240), notes: z.string().max(1000),
});

export const submitAppointment = createServerFn({ method: "POST" }).inputValidator((input: unknown) => appointmentSchema.parse(input)).handler(async ({ data }) => {
  const requested = new Date(`${data.requestedDate}T12:00:00`);
  const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
  if (requested < tomorrow) throw new Error("Please choose a future service date.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("appointments").insert({ address: data.address, email: data.email, full_name: data.fullName, notes: data.notes, phone: data.phone, property_type: data.propertyType, requested_date: data.requestedDate, requested_time: data.requestedTime, service: data.service });
  if (error) { console.error("Appointment request failed", error); throw new Error("We couldn't save your request. Please call us instead."); }
  return { ok: true };
});

const contactSchema = z.object({ fullName: z.string().min(2).max(100), email: z.string().email().max(180), phone: z.string().max(40), subject: z.string().min(2).max(120), message: z.string().min(10).max(2000) });
export const submitContact = createServerFn({ method: "POST" }).inputValidator((input: unknown) => contactSchema.parse(input)).handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("contact_requests").insert({ email: data.email, full_name: data.fullName, message: data.message, phone: data.phone, subject: data.subject });
  if (error) { console.error("Contact request failed", error); throw new Error("We couldn't send your message. Please call us instead."); }
  return { ok: true };
});