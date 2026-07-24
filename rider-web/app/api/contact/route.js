import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { registrations } from "@/lib/drizzleSchema";

export async function POST(req) {
  try {
    const data = await req.json();

    console.log("Incoming request data:", data); // Debug log to check incoming data

    const { name, phone, email, message, city } = data;

    // ✅ BASIC VALIDATION
    if (!name || !phone || !email || !city) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Name, phone, email, and city are required",
        }),
        { status: 400 }
      );
    }

    // ✅ EMAIL FORMAT VALIDATION
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid email format",
        }),
        { status: 400 }
      );
    }

    // ✅ SAVE SAME DATA TO DATABASE
    console.log("Data being inserted into database:", {
      rider_name: name.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      location: "Contact Form",
      message: message ? message.trim() : null,
      city: city.trim(),
      status: "pending",
    });

    try {
      const insertedData = await db.insert(registrations).values({
        rider_name: name.trim(),
        phone: phone.trim(),
        email: email.toLowerCase().trim(),
        location: "Contact Form",
        message: message ? message.trim() : null,
        city: city.trim(),
        status: "pending",
      });
      console.log("Inserted data:", insertedData);
    } catch (dbError) {
      console.error("Database insertion error:", dbError);
    }

    // ✅ SEND SAME DATA TO YOUR EMAIL
    try {
      const gmailPassword =
        process.env.GMAIL_APP_PASSWORD ||
        process.env.EMAIL_APP_PASSWORD;

      if (gmailPassword) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_ID || "pratapandsons10@gmail.com",
            pass: gmailPassword,
          },
        });

        const emailHTML = `
          <h2>📩 New Contact Message - GatiMitra</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <p>${message || "N/A"}</p>
          <p><strong>City:</strong> ${city}</p>
          <hr />
          <p style="font-size:12px;color:#777">
            Source: Website Contact Form
          </p>
        `;

        await transporter.sendMail({
          from: `"GatiMitra Contact" <${process.env.EMAIL_ID || "pratapandsons10@gmail.com"}>`,
          to: process.env.EMAIL_ID || "pratapandsons10@gmail.com",
          replyTo: email, // ✅ direct reply to user
          subject: `New Contact Message | ${name}`,
          text: `
New Contact Message - GatiMitra

Name: ${name}
Phone: ${phone}
Email: ${email}
Message: ${message || "N/A"}
City: ${city}
          `,
          html: emailHTML,
        });
      }
    } catch (emailError) {
      console.error("Email error:", emailError);
      // ❗ Email fail hone par bhi DB save ho chuka hai
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Something went wrong",
      }),
      { status: 500 }
    );
  }
}
