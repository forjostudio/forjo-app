


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "professional_id" "uuid",
    "service_id" "uuid",
    "client_id" "uuid",
    "client_name" "text" NOT NULL,
    "client_phone" "text",
    "client_email" "text",
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "email_sent" boolean DEFAULT false NOT NULL,
    "email_error" "text",
    "cancel_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deposit_paid" boolean DEFAULT false,
    "deposit_amount" numeric(10,2) DEFAULT 0,
    "mp_payment_id" "text",
    "expires_at" timestamp with time zone,
    "duration_minutes" integer,
    "google_event_id" "text"
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "day_of_week" integer NOT NULL,
    "open_time" time without time zone,
    "close_time" time without time zone,
    "is_open" boolean DEFAULT true
);


ALTER TABLE "public"."business_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_secrets" (
    "business_id" "uuid" NOT NULL,
    "mp_access_token" "text",
    "mp_refresh_token" "text",
    "mp_token_expires_at" timestamp with time zone,
    "resend_api_key" "text",
    "resend_from" "text",
    "recaptcha_secret_key" "text",
    "google_refresh_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#d94a2b'::"text",
    "whatsapp" "text",
    "address" "text",
    "instagram" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "require_deposit" boolean DEFAULT false,
    "deposit_amount" numeric(10,2) DEFAULT 0,
    "deposit_expiry_hours" integer DEFAULT 1,
    "notification_email" "text",
    "recaptcha_site_key" "text",
    "default_slot_duration" integer DEFAULT 60,
    "plan" "text" DEFAULT 'basic'::"text",
    "plan_status" "text" DEFAULT 'trial'::"text",
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "mp_subscription_id" "text",
    "mp_plan_id_active" "text",
    "subscription_ends_at" timestamp with time zone,
    "vertical" "text" DEFAULT 'general'::"text",
    "dashboard_widgets" "jsonb",
    "palette" "text" DEFAULT 'red'::"text" NOT NULL,
    "theme" "text" DEFAULT 'forjo'::"text" NOT NULL,
    "font" "text" DEFAULT 'auto'::"text" NOT NULL,
    "maps_url" "text",
    "buffer_minutes" integer DEFAULT 0 NOT NULL,
    "mp_user_id" "text"
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "client_id" "uuid",
    "file_url" "text" NOT NULL,
    "file_name" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'new'::"text",
    "client_number" integer,
    "insurance_name" "text",
    "insurance_number" "text",
    "preferences" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "client_id" "uuid",
    "note" "text" NOT NULL,
    "note_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clinical_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "category" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "due_day" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "fixed_expenses_due_day_chk" CHECK ((("due_day" IS NULL) OR (("due_day" >= 1) AND ("due_day" <= 31))))
);


ALTER TABLE "public"."fixed_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1,
    "amount" numeric(10,2) NOT NULL,
    "sale_date" "date" DEFAULT CURRENT_DATE,
    "type" "text" DEFAULT 'venta'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid"
);


ALTER TABLE "public"."manual_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "photo_url" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "last_name" "text",
    "specialty" "text",
    "license_number" "text",
    "phone" "text",
    "email" "text"
);


ALTER TABLE "public"."professionals" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_business_hours" AS
 SELECT "id",
    "business_id",
    "day_of_week",
    "open_time",
    "close_time",
    "is_open"
   FROM "public"."business_hours";


ALTER VIEW "public"."public_business_hours" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_businesses" AS
 SELECT "id",
    "owner_id",
    "slug",
    "name",
    "type",
    "vertical",
    "logo_url",
    "primary_color",
    "whatsapp",
    "address",
    "instagram",
    "require_deposit",
    "deposit_amount",
    "deposit_expiry_hours",
    "recaptcha_site_key",
    "default_slot_duration",
    "buffer_minutes",
    "created_at"
   FROM "public"."businesses";


ALTER VIEW "public"."public_businesses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_professionals" AS
 SELECT "id",
    "business_id",
    "name",
    "specialty",
    "active",
    "photo_url"
   FROM "public"."professionals"
  WHERE ("active" = true);


ALTER VIEW "public"."public_professionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "duration_minutes" integer NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "location_ids" "uuid"[]
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_services" AS
 SELECT "id",
    "business_id",
    "name",
    "duration_minutes",
    "price",
    "description",
    "active",
    "location_id",
    "location_ids",
    "created_at"
   FROM "public"."services"
  WHERE ("active" = true);


ALTER VIEW "public"."public_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" DEFAULT 'income'::"text"
);


ALTER TABLE "public"."saved_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "closed" boolean DEFAULT true NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."schedule_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid"
);


ALTER TABLE "public"."time_blocks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING "gist" ("business_id" WITH =, COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid") WITH =, "tsrange"(("date" + "time"), (("date" + "time") + "make_interval"("mins" => COALESCE("duration_minutes", 30)))) WITH &&) WHERE (("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"])));



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_secrets"
    ADD CONSTRAINT "business_secrets_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."client_attachments"
    ADD CONSTRAINT "client_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_expenses"
    ADD CONSTRAINT "fixed_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_sales"
    ADD CONSTRAINT "manual_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_blocks"
    ADD CONSTRAINT "time_blocks_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "appointments_cancel_token_idx" ON "public"."appointments" USING "btree" ("cancel_token");



CREATE UNIQUE INDEX "appointments_no_double_booking" ON "public"."appointments" USING "btree" ("business_id", COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "date", "time") WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"]));



CREATE INDEX "fixed_expenses_business_idx" ON "public"."fixed_expenses" USING "btree" ("business_id");



CREATE UNIQUE INDEX "schedule_exceptions_biz_date_loc" ON "public"."schedule_exceptions" USING "btree" ("business_id", "date", "location_id") NULLS NOT DISTINCT;



CREATE INDEX "schedule_exceptions_business_date" ON "public"."schedule_exceptions" USING "btree" ("business_id", "date");



CREATE INDEX "services_location" ON "public"."services" USING "btree" ("location_id");



CREATE INDEX "time_blocks_location" ON "public"."time_blocks" USING "btree" ("location_id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_secrets"
    ADD CONSTRAINT "business_secrets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_attachments"
    ADD CONSTRAINT "client_attachments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_attachments"
    ADD CONSTRAINT "client_attachments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_expenses"
    ADD CONSTRAINT "fixed_expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_sales"
    ADD CONSTRAINT "manual_sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_sales"
    ADD CONSTRAINT "manual_sales_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_blocks"
    ADD CONSTRAINT "time_blocks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_blocks"
    ADD CONSTRAINT "time_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business access" ON "public"."client_attachments" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."clinical_notes" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."expenses" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."locations" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."manual_sales" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."saved_products" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business access" ON "public"."time_blocks" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business member access" ON "public"."appointments" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business member access" ON "public"."business_hours" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business member access" ON "public"."clients" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business member access" ON "public"."professionals" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "business member access" ON "public"."services" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fixed_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fixed_expenses tenant delete" ON "public"."fixed_expenses" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "fixed_expenses tenant insert" ON "public"."fixed_expenses" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "fixed_expenses tenant select" ON "public"."fixed_expenses" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "fixed_expenses tenant update" ON "public"."fixed_expenses" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner access" ON "public"."businesses" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner access secrets" ON "public"."business_secrets" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner manage schedule_exceptions" ON "public"."schedule_exceptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "schedule_exceptions"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "schedule_exceptions"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read locations" ON "public"."locations" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public read schedule_exceptions" ON "public"."schedule_exceptions" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public read time_blocks" ON "public"."time_blocks" FOR SELECT USING (true);



ALTER TABLE "public"."saved_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_blocks" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."business_hours" TO "anon";
GRANT ALL ON TABLE "public"."business_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."business_hours" TO "service_role";



GRANT ALL ON TABLE "public"."business_secrets" TO "anon";
GRANT ALL ON TABLE "public"."business_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."business_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."client_attachments" TO "anon";
GRANT ALL ON TABLE "public"."client_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."client_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_notes" TO "anon";
GRANT ALL ON TABLE "public"."clinical_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_notes" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fixed_expenses" TO "anon";
GRANT ALL ON TABLE "public"."fixed_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."manual_sales" TO "anon";
GRANT ALL ON TABLE "public"."manual_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_sales" TO "service_role";



GRANT ALL ON TABLE "public"."professionals" TO "anon";
GRANT ALL ON TABLE "public"."professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."professionals" TO "service_role";



GRANT ALL ON TABLE "public"."public_business_hours" TO "anon";
GRANT ALL ON TABLE "public"."public_business_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."public_business_hours" TO "service_role";



GRANT ALL ON TABLE "public"."public_businesses" TO "anon";
GRANT ALL ON TABLE "public"."public_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."public_businesses" TO "service_role";



GRANT ALL ON TABLE "public"."public_professionals" TO "anon";
GRANT ALL ON TABLE "public"."public_professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."public_professionals" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."public_services" TO "anon";
GRANT ALL ON TABLE "public"."public_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_services" TO "service_role";



GRANT ALL ON TABLE "public"."saved_products" TO "anon";
GRANT ALL ON TABLE "public"."saved_products" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_products" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."time_blocks" TO "anon";
GRANT ALL ON TABLE "public"."time_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."time_blocks" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







