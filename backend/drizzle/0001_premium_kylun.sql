CREATE TYPE "public"."onboarding_status" AS ENUM('not_started', 'in_progress', 'pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "rider_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"rider_id" text NOT NULL,
	"document_type" text NOT NULL,
	"aadhaar_masked" text,
	"pan_partial" text,
	"dl_number" text,
	"rc_number" text,
	"full_name" text,
	"selfie_signed_url" text,
	"rental_proof_signed_url" text,
	"ev_proof_signed_url" text,
	"max_speed_declaration" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"rider_id" text NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
ALTER TABLE "riders" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "riders" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "onboarding_status" "onboarding_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "riders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;