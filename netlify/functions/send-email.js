const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, subject, body } = JSON.parse(event.body);

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_USERNAME,
      to: to,
      subject: subject,
      text: body
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "success", message: "Email sent successfully" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 